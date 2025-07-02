import type {
	ContentBlock,
	Message,
	MessageCreateParams,
	RawMessageStreamEvent,
	TextBlock,
	ThinkingBlock,
	ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { ProcessedPair } from "../../../src/shared-conversation-processor";

export { ProcessedPair };

export interface RawPairData {
	request_body: MessageCreateParams;
	response_body?: Message;
	body_raw?: string;
	response_headers?: Record<string, string>;
	timestamp?: string;
}

/**
 * Convert raw mitmproxy data to typed ProcessedPair array
 */
export function processRawPairs(rawData: RawPairData[]): ProcessedPair[] {
	return rawData
		.map((pair, index) => {
			const request = pair.request_body;
			if (!request) {
				// Skip pairs without request body
				return null;
			}
			const isStreaming = request.stream === true;

			let response: Message;
			if (isStreaming) {
				response = reconstructMessageFromSSE(pair.body_raw || "");
			} else {
				response = pair.response_body!; // Non-streaming must have response_body
			}

			return {
				id: `pair-${index}`,
				timestamp: pair.timestamp || new Date().toISOString(),
				request,
				response,
				model: request.model,
				isStreaming,
			};
		})
		.filter((pair) => pair !== null) as ProcessedPair[];
}

/**
 * Reconstruct a complete Message from SSE events
 */

function reconstructMessageFromSSE(sseData: string): Message {
	const events = parseSSEEvents(sseData);

	// Initialize with defaults
	let message: Partial<Message> = {
		id: "",
		type: "message",
		role: "assistant",
		content: [],
		model: "",
		stop_reason: null,
		stop_sequence: null,
		usage: {
			input_tokens: 0,
			output_tokens: 0,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			server_tool_use: null,
			service_tier: null,
		},
	};

	// Track content blocks being built
	const contentBlocks: ContentBlock[] = [];
	let currentBlockIndex = -1;

	for (const event of events) {
		switch (event.type) {
			case "message_start":
				// Initialize message with base structure
				message = { ...message, ...event.message };
				break;

			case "content_block_start":
				// Start a new content block
				currentBlockIndex = event.index;
				contentBlocks[currentBlockIndex] = { ...event.content_block };
				break;

			case "content_block_delta":
				// Update the current content block
				if (currentBlockIndex >= 0 && contentBlocks[currentBlockIndex]) {
					const block = contentBlocks[currentBlockIndex];
					const delta = event.delta;

					switch (delta.type) {
						case "text_delta":
							if (block.type === "text") {
								(block as TextBlock).text = ((block as TextBlock).text || "") + delta.text;
							}
							break;

						case "input_json_delta":
							if (block.type === "tool_use") {
								// Accumulate JSON string for tool_use blocks
								const toolBlock = block as ToolUseBlock;
								if (typeof toolBlock.input === "string") {
									toolBlock.input = toolBlock.input + delta.partial_json;
								} else {
									// Initialize as string if not already
									(toolBlock.input as any) = delta.partial_json;
								}
							}
							break;

						case "thinking_delta":
							if (block.type === "thinking") {
								(block as ThinkingBlock).thinking = ((block as ThinkingBlock).thinking || "") + delta.thinking;
							}
							break;

						case "signature_delta":
							if (block.type === "thinking") {
								(block as ThinkingBlock).signature =
									((block as ThinkingBlock).signature || "") + delta.signature;
							}
							break;

						case "citations_delta":
							// Handle citations delta if needed
							break;
					}
				}
				break;

			case "content_block_stop":
				// Finalize content block
				if (currentBlockIndex >= 0 && contentBlocks[currentBlockIndex]) {
					const block = contentBlocks[currentBlockIndex];
					// Parse JSON input if it's a tool_use block
					if (block.type === "tool_use") {
						const toolBlock = block as ToolUseBlock;
						if (typeof toolBlock.input === "string") {
							try {
								toolBlock.input = JSON.parse(toolBlock.input);
							} catch (e) {
								// Keep as string if JSON parsing fails
								console.warn("Failed to parse tool input JSON:", toolBlock.input);
							}
						}
					}
				}
				break;

			case "message_delta":
				// Update message-level fields
				if (event.delta.stop_reason) {
					message.stop_reason = event.delta.stop_reason;
				}
				if (event.delta.stop_sequence) {
					message.stop_sequence = event.delta.stop_sequence;
				}
				if (event.usage) {
					// Preserve existing input_tokens if not provided in this delta
					// Input tokens are typically only sent once and shouldn't change
					const currentInputTokens = message.usage?.input_tokens ?? 0;

					message.usage = {
						input_tokens: event.usage.input_tokens ?? currentInputTokens,
						output_tokens: event.usage.output_tokens ?? message.usage?.output_tokens ?? 0,
						cache_creation_input_tokens:
							event.usage.cache_creation_input_tokens ?? message.usage?.cache_creation_input_tokens ?? null,
						cache_read_input_tokens:
							event.usage.cache_read_input_tokens ?? message.usage?.cache_read_input_tokens ?? null,
						server_tool_use: event.usage.server_tool_use ?? message.usage?.server_tool_use ?? null,
						service_tier: null, // MessageDeltaUsage doesn't have service_tier
					};
				}
				break;

			case "message_stop":
				// Finalize message
				break;
		}
	}

	// Set the final content blocks
	message.content = contentBlocks.filter((block) => block != null);

	return message as Message;
}

/**
 * Parse SSE event stream into individual events
 */
function parseSSEEvents(sseData: string): RawMessageStreamEvent[] {
	const events: RawMessageStreamEvent[] = [];
	const lines = sseData.split("\n");

	for (const line of lines) {
		if (line.startsWith("data: ")) {
			const data = line.slice(6);

			if (data === "[DONE]") {
				break;
			}

			try {
				const parsed = JSON.parse(data) as RawMessageStreamEvent;
				events.push(parsed);
			} catch (e) {
				// Skip malformed JSON
				console.warn("Failed to parse SSE data:", data);
			}
		}
		// Ignore other SSE fields like 'event:', 'id:', etc.
	}

	return events;
}
