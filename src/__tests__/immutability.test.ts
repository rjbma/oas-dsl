import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec, routeWithBody, getBodySchema } from "./helpers";

describe("immutability", () => {
  it("string().min() does not mutate the original", async () => {
    const original = oas.string();
    const modified = original.min(5);

    const spec = await buildSpec([
      routeWithBody(original, "original"),
      {
        operationId: "modified",
        description: "test",
        method: "POST",
        path: "/modified",
        validate: { body: modified },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const origSchema = getBodySchema(spec);
    const modSchema =
      spec.paths["/modified"].post.requestBody.content["application/json"]
        .schema;

    expect(origSchema).toEqual({ type: "string" });
    expect(modSchema).toEqual({ type: "string", minLength: 5 });
  });

  it("required() does not mutate the original", async () => {
    const original = oas.string();
    const modified = original.required();

    const spec = await buildSpec([
      routeWithBody(
        oas.object({ a: original, b: modified }),
      ),
    ]);

    const schema = getBodySchema(spec);
    expect(schema.required).toEqual(["b"]);
  });

  it("description() does not mutate the original", async () => {
    const original = oas.number();
    original.description("should not appear");

    const spec = await buildSpec([routeWithBody(original)]);
    expect(getBodySchema(spec).description).toBeUndefined();
  });

  it("items() does not mutate the original array", async () => {
    const original = oas.array();
    const modified = original.items(oas.string());

    const spec = await buildSpec([
      routeWithBody(modified, "modified"),
      {
        operationId: "original",
        description: "test",
        method: "POST",
        path: "/original",
        validate: { body: original },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const origSchema =
      spec.paths["/original"].post.requestBody.content["application/json"]
        .schema;
    const modSchema = getBodySchema(spec, "/test");

    expect(origSchema).toEqual({ type: "array" });
    expect(modSchema.items).toEqual({ type: "string" });
  });

  it("additionalProperties() does not mutate the original object", async () => {
    const original = oas.object({ x: oas.string() });
    const modified = original.additionalProperties(false);

    const spec = await buildSpec([
      routeWithBody(original, "original"),
      {
        operationId: "modified",
        description: "test",
        method: "POST",
        path: "/modified",
        validate: { body: modified },
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    const origSchema = getBodySchema(spec);
    const modSchema =
      spec.paths["/modified"].post.requestBody.content["application/json"]
        .schema;

    expect(origSchema.additionalProperties).toBeUndefined();
    expect(modSchema.additionalProperties).toBe(false);
  });
});
