import { describe, it, expect } from "vitest";
import { oas } from "../index";
import { buildSpec } from "./helpers";

describe("top-level schema structure", () => {
  it("sets openapi version to 3.0.0", async () => {
    const spec = await buildSpec([]);
    expect(spec.openapi).toBe("3.0.0");
  });

  it("populates info with title, version, and description", async () => {
    const spec = await buildSpec([], { type: "flat" }, {
      info: {
        title: "My API",
        version: "2.1.0",
        description: "An API description",
      },
    });

    expect(spec.info.title).toBe("My API");
    expect(spec.info.version).toBe("2.1.0");
    expect(spec.info.description).toBe("An API description");
  });

  it("populates servers array", async () => {
    const spec = await buildSpec([], { type: "flat" }, {
      servers: [
        {
          url: "https://api.example.com",
          description: "Production",
        },
      ],
    });

    expect(spec.servers).toEqual([
      { url: "https://api.example.com", description: "Production" },
    ]);
  });

  it("produces empty paths when no routes provided", async () => {
    const spec = await buildSpec([]);
    expect(spec.paths).toEqual({});
  });

  it("does not include undefined values in the output", async () => {
    const spec = await buildSpec([
      {
        operationId: "test",
        description: "test",
        method: "GET",
        path: "/test",
        successResponse: { statusCode: 200, description: "ok" },
      },
    ]);

    // The JSON was parsed from a string, so undefined values would have been
    // stripped during JSON.stringify. Verify key fields are absent rather than undefined.
    const route = spec.paths["/test"].get;
    expect("parameters" in route).toBe(false);
    expect("requestBody" in route).toBe(false);
    expect("deprecated" in route).toBe(false);
  });

  it("includes tags in the top-level spec", async () => {
    const spec = await buildSpec([], { type: "flat" }, {
      tags: ["Users", "Admin"],
    });

    expect(spec.tags).toEqual(["Users", "Admin"]);
  });
});
