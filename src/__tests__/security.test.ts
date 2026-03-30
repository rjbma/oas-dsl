import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("security", () => {
  it("generates global security requirements", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "GET",
          path: "/test",
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
      {
        security: [{ name: "bearerAuth", scopes: [] }],
      },
    );

    expect(spec.security).toEqual([{ bearerAuth: [] }]);
  });

  it("generates route-level security", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        security: [{ name: "OAuth2", scopes: ["read", "write"] }],
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    expect(spec.paths["/test"].get.security).toEqual([
      { OAuth2: ["read", "write"] },
    ]);
  });

  it("generates HTTP bearer security scheme", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "GET",
          path: "/test",
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
      {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    );

    expect(spec.components.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
  });

  it("generates API key security scheme", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "GET",
          path: "/test",
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
      {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "X-API-Key",
            in: "header",
          },
        },
      },
    );

    expect(spec.components.securitySchemes.apiKey).toEqual({
      type: "apiKey",
      name: "X-API-Key",
      in: "header",
    });
  });

  it("generates OpenID Connect security scheme", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "GET",
          path: "/test",
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
      {
        securitySchemes: {
          openId: {
            type: "openIdConnect",
            openIdConnectUrl: "https://example.com/.well-known/openid",
          },
        },
      },
    );

    expect(spec.components.securitySchemes.openId).toEqual({
      type: "openIdConnect",
      openIdConnectUrl: "https://example.com/.well-known/openid",
    });
  });
});
