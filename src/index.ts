// Main exports for the package
export { ClaudeTrafficLogger, initializeInterceptor, getLogger, InterceptorConfig } from "./interceptor";
export { HTMLGenerator } from "./html-generator";
export { RawPair, ClaudeData, HTMLGenerationData, TemplateReplacements } from "./types";

// Re-export everything for convenience
export * from "./interceptor";
export * from "./html-generator";
export * from "./types";
