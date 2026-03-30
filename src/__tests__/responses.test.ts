import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("response schemas", () => {
  it("generates success response with schema", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: {
          statusCode: 200,
          description: "Success",
          schema: oas.object({ id: oas.number() }),
        },
      },
    ]);

    const response = spec.paths["/test"].get.responses["200"];
    expect(response.description).toBe("Success");
    expect(
      response.content["application/json"].schema.properties.id,
    ).toEqual({ type: "number" });
  });

  it("generates success response without schema", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "DELETE",
        path: "/test",
        successResponse: {
          statusCode: 204,
          description: "No content",
        },
      },
    ]);

    const response = spec.paths["/test"].delete.responses["204"];
    expect(response.description).toBe("No content");
    expect(response.content).toBeUndefined();
  });

  it("generates multiple error responses", async () => {
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
            schema: oas.object({ error: oas.string() }),
          },
          {
            statusCode: 404,
            description: "Not found",
          },
          {
            statusCode: 500,
            description: "Server error",
          },
        ],
      },
    ]);

    const responses = spec.paths["/test"].get.responses;
    expect(responses["400"].description).toBe("Bad request");
    expect(responses["400"].content["application/json"].schema).toBeDefined();
    expect(responses["404"].description).toBe("Not found");
    expect(responses["500"].description).toBe("Server error");
  });

  it("generates response headers", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: {
          statusCode: 200,
          description: "ok",
          schema: oas.string(),
          headers: oas.object({
            "X-Rate-Limit": oas.number().description("Rate limit"),
          }),
        },
      },
    ]);

    const headers = spec.paths["/test"].get.responses["200"].headers;
    expect(headers["X-Rate-Limit"]).toEqual({
      description: "Rate limit",
      schema: { type: "number" },
    });
  });

  it("generates response examples", async () => {
    const examples = {
      success: { description: "A success example", value: { id: 1 } },
    };
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
          examples,
        },
      },
    ]);

    const content =
      spec.paths["/test"].get.responses["200"].content["application/json"];
    expect(content.examples).toEqual(examples);
  });
});
