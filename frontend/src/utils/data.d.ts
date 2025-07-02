import type { Message, MessageCreateParams } from "@anthropic-ai/sdk/resources/messages";
export interface ProcessedPair {
	id: string;
	timestamp: string;
	request: MessageCreateParams;
	response: Message;
	model: string;
	isStreaming: boolean;
}
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
export declare function processRawPairs(rawData: RawPairData[]): ProcessedPair[];
//# sourceMappingURL=data.d.ts.map
