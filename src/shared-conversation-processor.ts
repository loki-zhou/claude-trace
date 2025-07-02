import type {
	ContentBlock,
	Message,
	MessageCreateParams,
	RawMessageStreamEvent,
	TextBlock,
	ThinkingBlock,
	ToolUseBlock,
	MessageParam,
	TextBlockParam,
	ToolResultBlockParam,
	ToolUseBlock as ToolUseBlockType,
	ContentBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { RawPair } from "./types";

// Core interfaces for processed data
export interface ProcessedPair {
	id: string;
	timestamp: string;
	request: MessageCreateParams;
	response: Message;
	model: string;
	isStreaming: boolean;
}

// Extended message type with tool result pairing
export interface EnhancedMessageParam extends MessageParam {
	toolResults?: Record<string, ToolResultBlockParam>;
	hide?: boolean;
}

export interface SimpleConversation {
	id: string;
	models: Set<string>;
	system?: string | TextBlockParam[];
	messages: EnhancedMessageParam[];
	response: Message;
	allPairs: ProcessedPair[];
	finalPair: ProcessedPair;
	compacted?: boolean;
	metadata: {
		startTime: string;
		endTime: string;
		totalPairs: number;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
}

/**
 * Shared conversation processing functionality for both frontend and backend
 */
export class SharedConversationProcessor {
	/**
	 * Process raw JSONL pairs into ProcessedPairs
	 */
	processRawPairs(rawPairs: RawPair[]): ProcessedPair[] {
		const processedPairs: ProcessedPair[] = [];

		for (const pair of rawPairs) {
			if (!pair.request || !pair.response) continue;

			// Detect streaming
			const isStreaming = !!pair.response.body_raw;
			let response: Message;

			if (isStreaming && pair.response.body_raw) {
				// Parse streaming response
				response = this.parseStreamingResponse(pair.response.body_raw);
			} else if (pair.response.body) {
				response = pair.response.body as Message;
			} else {
				continue;
			}

			// Extract model from request headers or URL
			const model = this.extractModel(pair);

			processedPairs.push({
				id: `${pair.request.timestamp || Date.now()}_${Math.random()}`,
				timestamp: new Date((pair.request.timestamp || Date.now()) * 1000).toISOString(),
				request: pair.request.body as MessageCreateParams,
				response,
				model,
				isStreaming,
			});
		}

		return processedPairs;
	}

	/**
	 * Parse streaming response from raw SSE data
	 */
	private parseStreamingResponse(bodyRaw: string): Message {
		const lines = bodyRaw.split("\n");
		let content: ContentBlock[] = [];
		let usage: any = null;
		let model = "";
		let id = "";
		let role: "assistant" = "assistant";

		for (const line of lines) {
			if (!line.startsWith("data: ")) continue;

			const data = line.substring(6).trim();
			if (data === "[DONE]") break;

			try {
				const event = JSON.parse(data) as RawMessageStreamEvent;

				if (event.type === "message_start") {
					model = event.message.model;
					id = event.message.id;
					role = event.message.role;
				} else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
					// Find or create text block
					const index = event.index;
					if (!content[index]) {
						content[index] = { type: "text", text: "" } as TextBlock;
					}
					if (content[index].type === "text") {
						(content[index] as TextBlock).text += event.delta.text;
					}
				} else if (event.type === "message_delta") {
					usage = event.usage;
				}
			} catch (e) {
				// Skip invalid JSON
			}
		}

		return {
			id,
			model,
			role,
			content,
			usage,
			type: "message",
			stop_reason: "end_turn",
			stop_sequence: null,
		} as Message;
	}

	/**
	 * Extract model name from the raw pair
	 */
	private extractModel(pair: RawPair): string {
		// Try to get model from request body
		if (pair.request?.body && typeof pair.request.body === "object" && "model" in pair.request.body) {
			return (pair.request.body as any).model;
		}

		// Try to get from response
		if (pair.response?.body && typeof pair.response.body === "object" && "model" in pair.response.body) {
			return (pair.response.body as any).model;
		}

		// Default
		return "unknown";
	}

	/**
	 * Group processed pairs into conversations
	 */
	mergeConversations(
		pairs: ProcessedPair[],
		options: { includeShortConversations?: boolean } = {},
	): SimpleConversation[] {
		if (!pairs || pairs.length === 0) return [];

		// Group pairs by system instructions + model
		const pairsBySystem = new Map<string, ProcessedPair[]>();

		for (const pair of pairs) {
			const system = pair.request.system;
			const model = pair.model;
			const systemKey = JSON.stringify({ system, model });

			if (!pairsBySystem.has(systemKey)) {
				pairsBySystem.set(systemKey, []);
			}
			pairsBySystem.get(systemKey)!.push(pair);
		}

		const allConversations: SimpleConversation[] = [];

		for (const [, systemPairs] of pairsBySystem) {
			const sortedPairs = [...systemPairs].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			// Group pairs by conversation thread
			const conversationThreads = new Map<string, ProcessedPair[]>();

			for (const pair of sortedPairs) {
				const messages = pair.request.messages || [];
				if (messages.length === 0) continue;

				const firstUserMessage = messages[0];
				const normalizedFirstMessage = this.normalizeMessageForGrouping(firstUserMessage);
				const conversationKey = JSON.stringify({ firstMessage: normalizedFirstMessage });
				const keyHash = this.hashString(conversationKey);

				if (!conversationThreads.has(keyHash)) {
					conversationThreads.set(keyHash, []);
				}
				conversationThreads.get(keyHash)!.push(pair);
			}

			// For each conversation thread, keep the final pair
			for (const [conversationKey, threadPairs] of conversationThreads) {
				const sortedThreadPairs = [...threadPairs].sort(
					(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
				);

				const finalPair = sortedThreadPairs.reduce((longest, current) => {
					const currentMessages = current.request.messages || [];
					const longestMessages = longest.request.messages || [];
					return currentMessages.length > longestMessages.length ? current : longest;
				});

				const modelsUsed = new Set(sortedThreadPairs.map((pair) => pair.model));
				const enhancedMessages = this.processToolResults(finalPair.request.messages || []);

				const conversation: SimpleConversation = {
					id: this.hashString(conversationKey),
					models: modelsUsed,
					system: finalPair.request.system,
					messages: enhancedMessages,
					response: finalPair.response,
					allPairs: sortedThreadPairs,
					finalPair: finalPair,
					metadata: {
						startTime: sortedThreadPairs[0].timestamp,
						endTime: finalPair.timestamp,
						totalPairs: sortedThreadPairs.length,
						inputTokens: finalPair.response.usage?.input_tokens || 0,
						outputTokens: finalPair.response.usage?.output_tokens || 0,
						totalTokens:
							(finalPair.response.usage?.input_tokens || 0) + (finalPair.response.usage?.output_tokens || 0),
					},
				};

				allConversations.push(conversation);
			}
		}

		// Apply compact conversation detection
		const mergedConversations = this.detectAndMergeCompactConversations(allConversations);

		// Filter out short conversations unless explicitly included
		const filteredConversations = options.includeShortConversations
			? mergedConversations
			: mergedConversations.filter((conv) => conv.messages.length > 2);

		// Sort by start time
		return filteredConversations.sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);
	}

	/**
	 * Process messages to pair tool_use with tool_result
	 */
	private processToolResults(messages: MessageParam[]): EnhancedMessageParam[] {
		const enhancedMessages: EnhancedMessageParam[] = [];
		const pendingToolUses: Record<string, { messageIndex: number; toolIndex: number }> = {};

		for (let i = 0; i < messages.length; i++) {
			const message = messages[i];
			const enhancedMessage: EnhancedMessageParam = { ...message, toolResults: {}, hide: false };

			if (Array.isArray(message.content)) {
				let hasOnlyToolResults = true;
				let hasTextContent = false;

				for (let j = 0; j < message.content.length; j++) {
					const block = message.content[j];

					if (block.type === "tool_use" && "id" in block) {
						const toolUse = block as ToolUseBlockType;
						pendingToolUses[toolUse.id] = { messageIndex: i, toolIndex: j };
						hasOnlyToolResults = false;
					} else if (block.type === "tool_result" && "tool_use_id" in block) {
						const toolResult = block as ToolResultBlockParam;
						const toolUseId = toolResult.tool_use_id;

						if (pendingToolUses[toolUseId]) {
							const { messageIndex } = pendingToolUses[toolUseId];
							if (!enhancedMessages[messageIndex]) {
								enhancedMessages[messageIndex] = { ...messages[messageIndex], toolResults: {}, hide: false };
							}
							enhancedMessages[messageIndex].toolResults![toolUseId] = toolResult;
							delete pendingToolUses[toolUseId];
						}
					} else if (block.type === "text") {
						hasTextContent = true;
						hasOnlyToolResults = false;
					} else {
						hasOnlyToolResults = false;
					}
				}

				if (hasOnlyToolResults && !hasTextContent) {
					enhancedMessage.hide = true;
				}
			}

			enhancedMessages[i] = enhancedMessage;
		}

		return enhancedMessages;
	}

	/**
	 * Detect and merge compact conversations
	 */
	private detectAndMergeCompactConversations(conversations: SimpleConversation[]): SimpleConversation[] {
		if (conversations.length <= 1) return conversations;

		const sortedConversations = [...conversations].sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);

		const usedConversations = new Set<number>();
		const mergedConversations: SimpleConversation[] = [];

		for (let i = 0; i < sortedConversations.length; i++) {
			const currentConv = sortedConversations[i];

			if (usedConversations.has(i)) continue;

			// Check if this is a compact conversation (1 pair with many messages)
			if (currentConv.allPairs.length === 1 && currentConv.messages.length > 2) {
				let originalConv: SimpleConversation | null = null;
				let originalIndex = -1;

				for (let j = 0; j < sortedConversations.length; j++) {
					if (j === i || usedConversations.has(j)) continue;

					const otherConv = sortedConversations[j];

					// Check if other conversation has exactly 2 fewer messages
					if (otherConv.messages.length === currentConv.messages.length - 2) {
						// Check if messages match (simplified check)
						let messagesMatch = true;
						for (let k = 1; k < otherConv.messages.length; k++) {
							if (!this.messagesRoughlyEqual(otherConv.messages[k], currentConv.messages[k])) {
								messagesMatch = false;
								break;
							}
						}

						if (messagesMatch) {
							originalConv = otherConv;
							originalIndex = j;
							break;
						}
					}
				}

				if (originalConv) {
					const mergedConv = this.mergeCompactConversation(originalConv, currentConv);
					mergedConversations.push(mergedConv);
					usedConversations.add(i);
					usedConversations.add(originalIndex);
				} else {
					currentConv.compacted = true;
					mergedConversations.push(currentConv);
					usedConversations.add(i);
				}
			} else {
				mergedConversations.push(currentConv);
				usedConversations.add(i);
			}
		}

		// Add remaining conversations
		for (let i = 0; i < sortedConversations.length; i++) {
			if (!usedConversations.has(i)) {
				mergedConversations.push(sortedConversations[i]);
			}
		}

		return mergedConversations.sort(
			(a, b) => new Date(a.metadata.startTime).getTime() - new Date(b.metadata.startTime).getTime(),
		);
	}

	/**
	 * Merge a compact conversation with its original counterpart
	 */
	private mergeCompactConversation(
		originalConv: SimpleConversation,
		compactConv: SimpleConversation,
	): SimpleConversation {
		const originalMessages = originalConv.messages || [];
		const compactMessages = compactConv.messages || [];

		const mergedMessages = [...compactMessages];
		if (originalMessages.length > 0 && mergedMessages.length > 0) {
			mergedMessages[0] = originalMessages[0];
		}

		const allPairs = [...originalConv.allPairs, ...compactConv.allPairs].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);

		const allModels = new Set([...originalConv.models, ...compactConv.models]);
		const startTime = allPairs[0].timestamp;
		const endTime = allPairs[allPairs.length - 1].timestamp;

		return {
			id: compactConv.id,
			models: allModels,
			system: originalConv.system,
			messages: mergedMessages,
			response: compactConv.response,
			allPairs: allPairs,
			finalPair: compactConv.finalPair,
			compacted: true,
			metadata: {
				startTime: startTime,
				endTime: endTime,
				totalPairs: allPairs.length,
				inputTokens: (originalConv.metadata.inputTokens || 0) + (compactConv.metadata.inputTokens || 0),
				outputTokens: (originalConv.metadata.outputTokens || 0) + (compactConv.metadata.outputTokens || 0),
				totalTokens: (originalConv.metadata.totalTokens || 0) + (compactConv.metadata.totalTokens || 0),
			},
		};
	}

	/**
	 * Compare two messages to see if they're roughly equal
	 */
	private messagesRoughlyEqual(msg1: MessageParam, msg2: MessageParam): boolean {
		if (msg1.role !== msg2.role) return false;

		const content1 = msg1.content;
		const content2 = msg2.content;

		if (typeof content1 !== typeof content2) return false;
		if (Array.isArray(content1) !== Array.isArray(content2)) return false;

		return true;
	}

	/**
	 * Normalize message for grouping (removes dynamic content)
	 */
	private normalizeMessageForGrouping(message: MessageParam): MessageParam {
		if (!message || !message.content) return message;

		let normalizedContent: string | ContentBlockParam[];

		if (Array.isArray(message.content)) {
			normalizedContent = message.content.map((block) => {
				if (block.type === "text" && "text" in block) {
					let text = block.text;
					text = text.replace(/Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, "Generated [TIMESTAMP]");
					text = text.replace(/The user opened the file [^\s]+ in the IDE\./g, "The user opened file in IDE.");
					text = text.replace(/<system-reminder>.*?<\/system-reminder>/gs, "[SYSTEM-REMINDER]");
					return { type: "text", text: text };
				}
				return block;
			});
		} else {
			normalizedContent = message.content;
		}

		return {
			role: message.role,
			content: normalizedContent,
		};
	}

	/**
	 * Generate hash string for conversation grouping
	 */
	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString();
	}
}
