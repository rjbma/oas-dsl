import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("route definition", () => {
  it("generates a minimal GET route", async () => {
    const spec = await buildSpec([
      {
        operationId: "getUsers",
        description: "Get all users",
        method: "GET",
        path: "/users",
        successResponse: { statusCode: 200, description: "Success" },
      },
    ]);

    const route = spec.paths["/users"].get;
    expect(route.operationId).toBe("getUsers");
    expect(route.summary).toBe("Get all users");
    expect(route.responses["200"].description).toBe("Success");
  });

  it("generates a POST route with request body", async () => {
    const spec = await buildSpec([
      {
        operationId: "createUser",
        description: "Create a user",
        method: "POST",
        path: "/users",
        validate: {
          body: oas.object({ name: oas.string() }),
        },
        successResponse: { statusCode: 201, description: "Created" },
      },
    ]);

    const route = spec.paths["/users"].post;
    const bodySchema =
      route.requestBody.content["application/json"].schema;
    expect(bodySchema.type).toBe("object");
    expect(bodySchema.properties.name).toEqual({ type: "string" });
  });

  it("generates path parameters as always required", async () => {
    const spec = await buildSpec([
      {
        operationId: "getUser",
        description: "Get user",
        method: "GET",
        path: "/users/{id}",
        validate: {
          path: oas.object({ id: oas.string() }),
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const params = spec.paths["/users/{id}"].get.parameters;
    const idParam = params.find((p: any) => p.name === "id");
    expect(idParam.in).toBe("path");
    expect(idParam.required).toBe(true);
  });

  it("generates query parameters with optional required", async () => {
    const spec = await buildSpec([
      {
        operationId: "searchUsers",
        description: "Search",
        method: "GET",
        path: "/users",
        validate: {
          query: oas.object({
            q: oas.string().required(),
            limit: oas.number(),
          }),
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const params = spec.paths["/users"].get.parameters;
    const qParam = params.find((p: any) => p.name === "q");
    const limitParam = params.find((p: any) => p.name === "limit");
    expect(qParam.in).toBe("query");
    expect(qParam.required).toBe(true);
    expect(limitParam.in).toBe("query");
    expect(limitParam.required).toBeUndefined();
  });

  it("generates header parameters", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        validate: {
          headers: oas.object({
            "X-Request-Id": oas.string(),
          }),
        },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const params = spec.paths["/test"].get.parameters;
    expect(params[0].in).toBe("header");
    expect(params[0].name).toBe("X-Request-Id");
  });

  it("supports multiple methods on the same path", async () => {
    const spec = await buildSpec([
      {
        operationId: "getUsers",
        description: "Get users",
        method: "GET",
        path: "/users",
        successResponse: { statusCode: 200, description: "ok" },
      },
      {
        operationId: "createUser",
        description: "Create user",
        method: "POST",
        path: "/users",
        validate: { body: oas.string() },
        successResponse: { statusCode: 201, description: "created" },
      },
    ]);

    expect(spec.paths["/users"].get).toBeDefined();
    expect(spec.paths["/users"].post).toBeDefined();
  });

  it("uses explicit tags when provided", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        tags: ["Users", "Admin"],
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    expect(spec.paths["/test"].get.tags).toEqual(["Users", "Admin"]);
  });

  it("extracts tag from first path segment when no explicit tags", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/users/123",
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    expect(spec.paths["/users/123"].get.tags).toEqual(["users"]);
  });

  it("marks deprecated routes", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        deprecated: true,
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    expect(spec.paths["/test"].get.deprecated).toBe(true);
  });

  it("sorts routes by order field", async () => {
    const spec = await buildSpec([
      {
        operationId: "second",
        description: "second",
        method: "GET",
        path: "/second",
        order: 2,
        successResponse: { statusCode: 200, description: "ok" },
      },
      {
        operationId: "first",
        description: "first",
        method: "GET",
        path: "/first",
        order: 1,
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const paths = Object.keys(spec.paths);
    expect(paths).toEqual(["/first", "/second"]);
  });

  it("uses notes as the operation description", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "Short summary",
        notes: "Longer detailed description of the operation",
        method: "GET",
        path: "/test",
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const route = spec.paths["/test"].get;
    expect(route.summary).toBe("Short summary");
    expect(route.description).toBe(
      "Longer detailed description of the operation",
    );
  });

  it("generates a route with no validate section", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const route = spec.paths["/test"].get;
    expect(route.parameters).toBeUndefined();
    expect(route.requestBody).toBeUndefined();
  });
});
