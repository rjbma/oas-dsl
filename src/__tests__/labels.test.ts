import { describe, it, expect, beforeEach } from "vitest";
import { oas, FixedSchema } from "../index";
import { buildSpec } from "./helpers";

beforeEach(() => {
  FixedSchema.resetRegistry();
});

describe("FixedSchema / .label()", () => {
  it("inlines labeled schema in flat mode", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "POST",
          path: "/test",
          validate: {
            body: oas.object({ name: oas.string() }).label("UserInput"),
          },
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
    );

    const bodySchema =
      spec.paths["/test"].post.requestBody.content["application/json"].schema;
    expect(bodySchema.type).toBe("object");
    expect(bodySchema.$ref).toBeUndefined();
    // In flat mode, components/schemas should be empty
    expect(spec.components.schemas).toEqual({});
  });

  it("produces $ref in referenced mode", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "POST",
          path: "/test",
          validate: {
            body: oas.object({ name: oas.string() }).label("UserInput"),
          },
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "referenced" },
    );

    const bodySchema =
      spec.paths["/test"].post.requestBody.content["application/json"].schema;
    expect(bodySchema.$ref).toBe("#/components/schemas/UserInput");
  });

  it("places schema in components/schemas in referenced mode", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "POST",
          path: "/test",
          validate: {
            body: oas.object({ name: oas.string() }).label("UserInput"),
          },
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "referenced" },
    );

    expect(spec.components.schemas.UserInput).toBeDefined();
    expect(spec.components.schemas.UserInput.type).toBe("object");
    expect(spec.components.schemas.UserInput.properties.name).toEqual({
      type: "string",
    });
  });

  it("sanitizes label names (replaces special chars with _)", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "test",
          method: "POST",
          path: "/test",
          validate: {
            body: oas.string().label("My Schema!"),
          },
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "referenced" },
    );

    expect(spec.components.schemas["My_Schema_"]).toBeDefined();
  });

  it("throws on duplicate labels in referenced mode", async () => {
    await expect(
      buildSpec(
        [
          {
            operationId: "test1",
            description: "test",
            method: "POST",
            path: "/test1",
            validate: {
              body: oas.string().label("Duplicate"),
            },
            successResponse: { statusCode: 200, description: "ok" },
          },
          {
            operationId: "test2",
            description: "test",
            method: "POST",
            path: "/test2",
            validate: {
              body: oas.number().label("Duplicate"),
            },
            successResponse: { statusCode: 200, description: "ok" },
          },
        ],
        { type: "referenced" },
      ),
    ).rejects.toThrow();
  });
});
