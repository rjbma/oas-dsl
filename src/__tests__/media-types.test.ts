import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("media types on request body", () => {
  it("defaults to application/json when body is a Schema", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "POST",
        path: "/test",
        validate: { body: oas.object({ name: oas.string() }) },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const content = spec.paths["/test"].post.requestBody.content;
    expect(content["application/json"]).toBeDefined();
    expect(content["application/json"].schema.type).toBe("object");
  });

  it("supports a MediaTypeSchemaMap with multiple media types", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "POST",
        path: "/test",
        validate: {
          body: {
            "application/json": oas.object({ name: oas.string() }),
            "application/xml": oas.object({ name: oas.string() }),
          },
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const content = spec.paths["/test"].post.requestBody.content;
    expect(content["application/json"]).toBeDefined();
    expect(content["application/json"].schema.type).toBe("object");
    expect(content["application/xml"]).toBeDefined();
    expect(content["application/xml"].schema.type).toBe("object");
  });

  it("supports text/plain media type", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "POST",
        path: "/test",
        validate: {
          body: {
            "text/plain": oas.string(),
          },
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const content = spec.paths["/test"].post.requestBody.content;
    expect(content["text/plain"].schema).toEqual({ type: "string" });
  });

  it("supports application/x-ndjson media type", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "POST",
        path: "/test",
        validate: {
          body: {
            "application/x-ndjson": oas.object({ event: oas.string() }),
          },
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const content = spec.paths["/test"].post.requestBody.content;
    expect(content["application/x-ndjson"]).toBeDefined();
    expect(content["application/x-ndjson"].schema.type).toBe("object");
  });

  it("includes examples from individual schemas in MediaTypeSchemaMap", async () => {
    const examples = {
      ex1: { description: "Example", value: { name: "John" } },
    };
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "POST",
        path: "/test",
        validate: {
          body: {
            "application/json": oas
              .object({ name: oas.string() })
              .examples(examples),
          },
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const content = spec.paths["/test"].post.requestBody.content;
    expect(content["application/json"].examples).toEqual(examples);
  });
});

describe("media types on responses", () => {
  it("defaults to application/json when response schema is a Schema", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: {
          statusCode: 200,
          description: "ok",
          schema: oas.object({ id: oas.number() }),
        },
      },
    ]);

    const content = spec.paths["/test"].get.responses["200"].content;
    expect(content["application/json"]).toBeDefined();
    expect(content["application/json"].schema.type).toBe("object");
  });

  it("supports MediaTypeSchemaMap on success response", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: {
          statusCode: 200,
          description: "ok",
          schema: {
            "application/json": oas.object({ id: oas.number() }),
            "text/plain": oas.string(),
          },
        },
      },
    ]);

    const content = spec.paths["/test"].get.responses["200"].content;
    expect(content["application/json"].schema.type).toBe("object");
    expect(content["text/plain"].schema).toEqual({ type: "string" });
  });

  it("supports MediaTypeSchemaMap on error response", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: { statusCode: 200, description: "ok" },
        errorResponses: [
          {
            statusCode: 400,
            description: "Bad request",
            schema: {
              "application/json": oas.object({ error: oas.string() }),
              "text/plain": oas.string(),
            },
          },
        ],
      },
    ]);

    const content = spec.paths["/test"].get.responses["400"].content;
    expect(content["application/json"].schema.type).toBe("object");
    expect(content["text/plain"].schema).toEqual({ type: "string" });
  });
});
