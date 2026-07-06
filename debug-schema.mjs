import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

console.log("Top-level type:", ListToolsRequestSchema?._def?.typeName);
console.log("Has .shape directly:", typeof ListToolsRequestSchema?.shape);
console.log("Constructor name:", ListToolsRequestSchema?.constructor?.name);
console.log("Own keys:", Object.getOwnPropertyNames(ListToolsRequestSchema));

// If it's wrapped (ZodEffects etc.), the real object schema is often at ._def.schema
if (ListToolsRequestSchema?._def?.schema) {
  console.log("Found inner schema at _def.schema");
  console.log("Inner shape:", typeof ListToolsRequestSchema._def.schema.shape);
}