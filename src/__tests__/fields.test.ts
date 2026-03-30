import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec, routeWithBody, getBodySchema } from "./helpers";

describe("StringField", () => {
  it("produces a string schema", async () => {
    const spec = await buildSpec([routeWithBody(oas.string())]);
    console.log(JSON.stringify(spec, null, 2));
    expect(getBodySchema(spec)).toEqual({ type: "string" });
  });

  it("supports minLength and maxLength", async () => {
    const spec = await buildSpec([routeWithBody(oas.string().min(3).max(10))]);
    expect(getBodySchema(spec)).toEqual({
      type: "string",
      minLength: 3,
      maxLength: 10,
    });
  });

  it("supports pattern", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.string().pattern(/^[a-z]+$/)),
    ]);
    expect(getBodySchema(spec)).toEqual({
      type: "string",
      pattern: "^[a-z]+$",
    });
  });

  it("supports format", async () => {
    const spec = await buildSpec([routeWithBody(oas.string().format("email"))]);
    expect(getBodySchema(spec)).toEqual({
      type: "string",
      format: "email",
    });
  });
});

describe("BooleanField", () => {
  it("produces a boolean schema", async () => {
    const spec = await buildSpec([routeWithBody(oas.boolean())]);
    expect(getBodySchema(spec)).toEqual({ type: "boolean" });
  });
});

describe("DateField", () => {
  it("produces a string schema", async () => {
    const spec = await buildSpec([routeWithBody(oas.date())]);
    expect(getBodySchema(spec)).toEqual({ type: "string" });
  });

  it("supports iso() for date-time format", async () => {
    const spec = await buildSpec([routeWithBody(oas.date().iso())]);
    expect(getBodySchema(spec)).toEqual({
      type: "string",
      format: "date-time",
    });
  });
});

describe("NumberField", () => {
  it("produces a number schema", async () => {
    const spec = await buildSpec([routeWithBody(oas.number())]);
    expect(getBodySchema(spec)).toEqual({ type: "number" });
  });

  it("supports min, max, and default", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.number().min(0).max(100).default(42)),
    ]);
    expect(getBodySchema(spec)).toEqual({
      type: "number",
      minimum: 0,
      maximum: 100,
      default: 42,
    });
  });
});

describe("EnumField", () => {
  it("produces an enum schema", async () => {
    const spec = await buildSpec([routeWithBody(oas.allow("a", "b", "c"))]);
    expect(getBodySchema(spec)).toEqual({
      type: "string",
      enum: ["a", "b", "c"],
    });
  });
});

describe("ArrayField", () => {
  it("produces an array schema with items", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.array().items(oas.string())),
    ]);
    expect(getBodySchema(spec)).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("supports minItems and maxItems", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.array().items(oas.number()).min(1).max(10)),
    ]);
    expect(getBodySchema(spec)).toEqual({
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 10,
    });
  });

  it("supports array of objects", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.array().items(oas.object({ id: oas.number() }))),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.type).toBe("array");
    expect(schema.items.type).toBe("object");
    expect(schema.items.properties.id).toEqual({ type: "number" });
  });
});

describe("ObjectField", () => {
  it("produces an object schema with properties", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.object({ name: oas.string(), age: oas.number() })),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.type).toBe("object");
    expect(schema.properties.name).toEqual({ type: "string" });
    expect(schema.properties.age).toEqual({ type: "number" });
  });

  it("includes required fields", async () => {
    const spec = await buildSpec([
      routeWithBody(
        oas.object({
          name: oas.string().required(),
          age: oas.number(),
        }),
      ),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.required).toEqual(["name"]);
  });

  it("omits required array when no fields are required", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.object({ name: oas.string() })),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.required).toBeUndefined();
  });

  it("supports additionalProperties", async () => {
    const spec = await buildSpec([
      routeWithBody(
        oas.object({ name: oas.string() }).additionalProperties(false),
      ),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.additionalProperties).toBe(false);
  });

  it("supports nested objects", async () => {
    const spec = await buildSpec([
      routeWithBody(
        oas.object({
          address: oas.object({
            street: oas.string(),
            city: oas.string(),
          }),
        }),
      ),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.properties.address.type).toBe("object");
    expect(schema.properties.address.properties.street).toEqual({
      type: "string",
    });
  });
});

describe("OneOfSchema", () => {
  it("produces a oneOf schema", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.oneOf(oas.string(), oas.number())),
    ]);
    expect(getBodySchema(spec)).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
  });
});

describe("AnyOfSchema", () => {
  it("produces an anyOf schema", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.anyOf(oas.string(), oas.boolean())),
    ]);
    expect(getBodySchema(spec)).toEqual({
      anyOf: [{ type: "string" }, { type: "boolean" }],
    });
  });
});
