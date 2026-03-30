import { oas, Route, Schema } from "../index";

type Options = { type: "flat" | "referenced" };

export async function buildSpec(
  routes: Route[],
  options: Options = { type: "flat" },
  overrides: Record<string, unknown> = {},
) {
  const result = await oas.makeSchema(
    {
      openapiVersion: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      servers: [{ url: "http://localhost" }],
      tags: [],
      routes,
      output: { type: "none" },
      ...overrides,
    } as any,
    options,
  );
  return JSON.parse(result);
}

export function routeWithBody(body: Schema, operationId = "test"): Route {
  return {
    operationId,
    description: "test",
    method: "POST",
    path: "/test",
    validate: { body },
    successResponse: { statusCode: 200, description: "ok" },
  };
}

export function routeWithResponse(
  schema: Schema | undefined,
  extras: Record<string, unknown> = {},
): Route {
  return {
    operationId: "test",
    description: "test",
    method: "GET",
    path: "/test",
    successResponse: { statusCode: 200, description: "ok", schema, ...extras },
  };
}

export function getBodySchema(spec: any, path = "/test", method = "post") {
  return spec.paths[path][method].requestBody.content["application/json"]
    .schema;
}

export function getResponseSchema(
  spec: any,
  statusCode = 200,
  path = "/test",
  method = "get",
) {
  return spec.paths[path][method].responses[statusCode].content[
    "application/json"
  ].schema;
}
