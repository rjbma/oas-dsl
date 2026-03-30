import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec, routeWithBody, getBodySchema } from "./helpers";

describe("description()", () => {
  it("adds description to the schema", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.string().description("A name")),
    ]);
    expect(getBodySchema(spec).description).toBe("A name");
  });
});

describe("example()", () => {
  it("adds example to the schema", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.string().example("John")),
    ]);
    expect(getBodySchema(spec).example).toBe("John");
  });
});

describe("deprecated()", () => {
  it("marks schema as deprecated", async () => {
    const spec = await buildSpec([
      routeWithBody(oas.string().deprecated()),
    ]);
    expect(getBodySchema(spec).deprecated).toBe(true);
  });
});

describe("examples()", () => {
  it("adds examples to request body content", async () => {
    const examples = {
      ex1: { description: "Example 1", value: "hello" },
    };
    const route: any = {
      operationId: "test",
      description: "test",
      method: "POST",
      path: "/test",
      validate: { body: oas.string().examples(examples) },
      successResponse: { statusCode: 200, description: "ok" },
    };
    const spec = await buildSpec([route]);
    const content =
      spec.paths["/test"].post.requestBody.content["application/json"];
    expect(content.examples).toEqual(examples);
  });
});

describe("required()", () => {
  it("marks a field as required in its parent object", async () => {
    const spec = await buildSpec([
      routeWithBody(
        oas.object({
          email: oas.string().required(),
          nickname: oas.string(),
        }),
      ),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.required).toEqual(["email"]);
  });

  it("marks multiple fields as required", async () => {
    const spec = await buildSpec([
      routeWithBody(
        oas.object({
          email: oas.string().required(),
          name: oas.string().required(),
          age: oas.number(),
        }),
      ),
    ]);
    const schema = getBodySchema(spec);
    expect(schema.required).toEqual(
      expect.arrayContaining(["email", "name"]),
    );
    expect(schema.required).toHaveLength(2);
  });
});
