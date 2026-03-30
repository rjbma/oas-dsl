import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("JSONPath transformations", () => {
  it("transforms a value in the output schema", async () => {
    const spec = await buildSpec(
      [
        {
          operationId: "test",
          description: "original description",
          method: "GET",
          path: "/test",
          successResponse: { statusCode: 200, description: "ok" },
        },
      ],
      { type: "flat" },
      {
        transformations: [
          {
            jsonPath: "$.paths./test.get.summary",
            fn: () => "transformed description",
          },
        ],
      },
    );

    expect(spec.paths["/test"].get.summary).toBe("transformed description");
  });

  it("applies multiple transformations in order", async () => {
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
        transformations: [
          {
            jsonPath: "$.info.title",
            fn: () => "Transformed Title",
          },
          {
            jsonPath: "$.info.version",
            fn: () => "2.0.0",
          },
        ],
      },
    );

    expect(spec.info.title).toBe("Transformed Title");
    expect(spec.info.version).toBe("2.0.0");
  });
});
