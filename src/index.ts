import fs from "fs/promises";
import os from "os";
import path from "path";
import prettier from "prettier";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import crypto from "crypto";
import jp from "jsonpath";

type Examples = Record<string, { description?: string; value: unknown }>;
type JsonSchema = Record<string, unknown>;
type SecurityRequirement = { name: string; scopes: string[] };
type Options = {
  /**
   * Determines the type of schema to produce:
   * - `flat` schemas don't contain any `$ref` pointers; they're easier to read by some tools but are also bigger
   * - `referenced` schemas define schemas in the `components` section, and can be significantly smaller
   */
  type: "flat" | "referenced";
};

interface RouteResponse<S> {
  statusCode: S;
  description: string;
  schema?: Schema;
  headers?: ObjectField;
  examples?: Examples;
}

type Route = DefinedRoute | ReferencedRoute;
interface ReferencedRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  order?: number;
  ref: {
    file: string | URL;
    path: string;
  };
  deprecated?: boolean;
}
interface DefinedRoute {
  operationId: string;
  description: string;
  notes?: string;
  deprecated?: boolean;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  tags?: string[];
  validate?: {
    path?: ObjectField;
    query?: ObjectField;
    body?: Schema;
    headers?: ObjectField;
  };
  // fell free to add more success status codes if needed
  successResponse: RouteResponse<number>;
  // fell free to add more error status codes if needed
  errorResponses?: Array<RouteResponse<number>>;
  produces?: string;
  security?: Array<SecurityRequirement>;
  order?: number;
}

abstract class Schema {
  protected _description?: string;
  _required?: boolean;
  _deprecated?: boolean;
  _explode?: boolean;
  _examples?: Examples;
  protected _example?: any;
  abstract toJSonSchema(options: Options): JsonSchema;
  required() {
    const that = clone(this);
    that._required = true;
    return that;
  }
  deprecated() {
    const that = clone(this);
    that._deprecated = true;
    return that;
  }
  examples(examples: Examples) {
    const that = clone(this);
    that._examples = examples;
    return that;
  }
}

abstract class ExtensibleSchema extends Schema {
  description(d: string) {
    const that = clone(this);
    that._description = d;
    return that;
  }
  example(d: any) {
    const that = clone(this);
    that._example = d;
    return that;
  }
  label(d: string) {
    const that = new FixedSchema(this, d);
    return that;
  }
  toJSonSchema(options: Options): JsonSchema {
    const { type, format, ...ownFields } = this.ownFields(options);
    return ignoreUndefined({
      type,
      format,
      ...this.baseFields(),
      ...ownFields,
    });
  }
  baseFields() {
    return {
      description: this._description,
      example: this._example,
      deprecated: this._deprecated,
    };
  }
  abstract ownFields(options: Options): { type: string } & Record<string, any>;
}

/**
 * A schema that cannot be modified (e.g., no more fields can be added to it).
 *
 * This kind of schema is identified by a unique label, and is defined under the
 * `components/schemas` section of the spec.
 */
class FixedSchema extends Schema {
  protected _schema: Schema;
  protected _label: string;
  private static registeredFixedSchemas: string[] = [];

  constructor(schema: Schema, label: string) {
    super();
    this._schema = schema;
    this._label = toSchemaName(label);
    this._required = schema._required;
    this._deprecated = schema._deprecated;
    this._explode = schema._explode;
    FixedSchema.registeredFixedSchemas.push(this._label);
  }
  toJSonSchema(options: Options): JsonSchema {
    if (options.type == "flat") {
      return this._schema.toJSonSchema(options);
    } else {
      return {
        $ref: `#/components/schemas/${this._label}`,
      };
    }
  }
  toComponent(options: Options) {
    return { [toSchemaName(this._label)]: this._schema.toJSonSchema(options) };
  }
  getReferencedSchema() {
    return this._schema;
  }
  /**
   * Get a list of FixedSchemas that have been defined more than once.
   *
   * This is invalid for "referenced" schemas, where each FixedSchema
   * is defined in the `components` section, and thus must be unique
   */
  static getDuplicateFixedSchemas() {
    const schemaCount = FixedSchema.registeredFixedSchemas.reduce(
      (acc, s) => ({
        ...acc,
        [s]: (acc[s] || 0) + 1,
      }),
      {} as Record<string, number>
    );
    return Object.keys(schemaCount).filter((s) => schemaCount[s] > 1);
  }
}

/**
 * A schema that is a reference to another schema defined in an external file.
 */
class ReferenceSchema extends Schema {
  protected _file: URL | string;
  protected _path: string;
  private static externalFiles: Record<string, string> = {};

  constructor(file: URL | string, path: string) {
    super();
    this._file = file;
    this._path = path;
    ReferenceSchema.externalFiles[this._file.toString()] = "";
  }

  /**
   * Go through all the referenced schemas known up until this point, get their
   * external files, dereference those schemas (i.e., eliminate all `$ref` pointers),
   * and create new schema files in a temp directory.
   *
   * This should be done *after* the schema is fully defined, so that this can be done
   * for all possible references.
   */
  static async dereferenceExternalSchemas(
    routes: Route[],
    tempDir: string
  ): Promise<void> {
    // files in ReferencedRoutes
    routes.forEach((route) => {
      if ("ref" in route) {
        ReferenceSchema.externalFiles[route.ref.file.toString()] = "";
      }
    });

    // files in ReferenceSchemas
    await Promise.all(
      Object.keys(ReferenceSchema.externalFiles).map(
        async (externalFilePath, i) => {
          const targetFilename = path.join(
            tempDir,
            `spec-${i}-${getFilename(externalFilePath)}`
          );
          await normalizeSchema({
            tempDir,
            type: "dereference",
            source: {
              type: "file",
              filename: externalFilePath,
            },
            target: {
              type: "file",
              filename: targetFilename,
            },
          });

          ReferenceSchema.externalFiles[externalFilePath] = targetFilename;
        }
      )
    );
  }

  toJSonSchema(): JsonSchema {
    const sourceFilename = this._file.toString();
    const targetFilename = ReferenceSchema.externalFiles[sourceFilename];
    if (targetFilename) {
      return {
        $ref: `${targetFilename}#${this._path}`,
      };
    } else {
      throw new Error("External file not found: " + sourceFilename);
    }
  }
}

class StringField extends ExtensibleSchema {
  _minLength?: number;
  _maxLength?: number;
  _regex?: RegExp;

  min(d: number) {
    const that = clone(this);
    that._minLength = d;
    return that;
  }
  max(d: number) {
    const that = clone(this);
    that._maxLength = d;
    return that;
  }
  pattern(d: RegExp) {
    const that = clone(this);
    that._regex = d;
    return that;
  }
  ownFields() {
    return {
      type: "string",
      minLength: this._minLength,
      maxLength: this._maxLength,
      pattern: this._regex?.source,
    };
  }
}

class BooleanField extends ExtensibleSchema {
  ownFields() {
    return {
      type: "boolean",
    };
  }
}

class DateField extends ExtensibleSchema {
  _format: string | undefined;
  iso() {
    const that = clone(this);
    that._format = "date-time";
    return that;
  }
  ownFields() {
    return {
      type: "string",
      format: this._format,
    };
  }
}

class NumberField extends ExtensibleSchema {
  _min?: number;
  _max?: number;
  _default?: number;
  min(d: number) {
    const that = clone(this);
    that._min = d;
    return that;
  }
  max(d: number) {
    const that = clone(this);
    that._max = d;
    return that;
  }
  default(d: number) {
    const that = clone(this);
    that._default = d;
    return that;
  }
  ownFields() {
    return {
      type: "number",
      minimum: this._min,
      maximum: this._max,
      default: this._default,
    };
  }
}

class EnumField extends ExtensibleSchema {
  _enum: string[];
  constructor(...values: string[]) {
    super();
    this._enum = values;
  }
  ownFields() {
    return {
      type: "string",
      enum: this._enum,
    };
  }
}

class OneOfSchema extends Schema {
  _schemas: Schema[];
  constructor(...values: Schema[]) {
    super();
    this._schemas = values;
  }
  toJSonSchema(options: Options): JsonSchema {
    return {
      oneOf: this._schemas.map((s) => s.toJSonSchema(options)),
    };
  }
}

class AnyOfSchema extends Schema {
  _schemas: Schema[];
  constructor(...values: Schema[]) {
    super();
    this._schemas = values;
  }
  toJSonSchema(options: Options): JsonSchema {
    return {
      anyOf: this._schemas.map((s) => s.toJSonSchema(options)),
    };
  }
}

class ObjectField extends ExtensibleSchema {
  _fields: Record<string, Schema>;
  _additionalProperties?: boolean;

  constructor(fields?: Record<string, Schema>) {
    super();
    this._fields = fields || {};
  }

  additionalProperties(d: boolean) {
    const that = clone(this);
    that._additionalProperties = d;
    return that;
  }

  asParameterList(
    parameterType: "path" | "query" | "header" | "cookie",
    options: Options
  ) {
    const fields = this._fields;
    return Object.keys(fields).map((key) => {
      // we don't support FixedScemas being used as parameters; we need to revert to the original schema
      const fieldSchema =
        fields[key] instanceof FixedSchema
          ? (fields[key] as FixedSchema).getReferencedSchema()
          : fields[key];
      // don't include `example` in parameters, to avoid swagger-ui to fill them when trying out the API
      const { description, example, required, ...schema } =
        fieldSchema.toJSonSchema(options);
      return {
        description,
        name: key,
        in: parameterType,
        explode: fields[key]._explode,
        required: parameterType == "path" ? true : fields[key]._required,
        schema,
      };
    });
  }

  ownFields(options: Options) {
    const fields = this._fields;
    const fieldNames = Object.keys(fields);
    const requiredFields = fieldNames.filter((key) => {
      return fields[key]._required;
    });
    return {
      type: "object",
      description: this._description,
      properties:
        fieldNames.length == 0
          ? undefined
          : fieldNames.reduce(
              (acc, key) => ({
                ...acc,
                [key]: fields[key].toJSonSchema(options),
              }),
              {}
            ),
      additionaProperties: this._additionalProperties,
      required: requiredFields.length ? requiredFields : undefined,
    };
  }

  asResponseHeaders(options: Options) {
    const fields = this._fields;
    const fieldNames = Object.keys(fields);
    return fieldNames.reduce((acc, key) => {
      const schema: any = fields[key].toJSonSchema(options);
      return {
        ...acc,
        [key]: {
          schema: { type: schema.type },
          description: schema.description,
        },
      };
    }, {});
  }
}

class ArrayField extends ExtensibleSchema {
  _items: Schema | undefined;
  constructor() {
    super();
    this._explode = true;
  }
  items(d: Schema) {
    const that = clone(this);
    that._items = d;
    return that;
  }
  ownFields(options: Options) {
    return {
      type: "array",
      items: this._items?.toJSonSchema(options),
    };
  }
}

const oas = {
  string: () => new StringField(),
  boolean: () => new BooleanField(),
  date: () => new DateField(),
  number: () => new NumberField(),
  allow: (...values: string[]) => new EnumField(...values),
  object: (fields?: Record<string, Schema>) => new ObjectField(fields),
  array: () => new ArrayField(),
  ref: (params: { file: URL | string; path: string }) =>
    new ReferenceSchema(params.file, params.path),
  oneOf: (...schemas: Schema[]) => new OneOfSchema(...schemas),
  anyOf: (...schemas: Schema[]) => new AnyOfSchema(...schemas),
  makeSchema,
};

const routeToJsonSchema = (route: Route, options: Options): JsonSchema => {
  if ("operationId" in route) {
    const pathAsTag = /\/([^\/]+)/.exec(route.path)?.[1];
    const parameters = [
      ...(route.validate?.headers?.asParameterList("header", options) || []),
      ...(route.validate?.path?.asParameterList("path", options) || []),
      ...(route.validate?.query?.asParameterList("query", options) || []),
    ];
    return ignoreUndefined({
      summary: route.description,
      operationId: route.operationId,
      description: route.notes,
      deprecated: route.deprecated,
      parameters: parameters.length ? parameters : undefined,
      requestBody: route.validate?.body && {
        content: {
          "application/json": {
            schema: route.validate.body.toJSonSchema(options),
            examples: route.validate.body._examples,
          },
        },
      },
      tags: route.tags || (pathAsTag ? [pathAsTag] : undefined),
      security: route.security && securityToJsonSchema(route.security),
      responses: {
        [route.successResponse.statusCode]: toResponseSchema(
          route.successResponse,
          options
        ),
        ...(route.errorResponses || []).reduce(
          (acc, response) => ({
            ...acc,
            [response.statusCode]: toResponseSchema(response, options),
          }),
          {}
        ),
      },
      "x-order": route.order,
    });
  } else {
    const filename =
      route.ref.file instanceof URL
        ? route.ref.file.toString()
        : route.ref.file;
    return ignoreUndefined({
      $ref: `${filename}#${route.ref.path}`,
      deprecated: route.deprecated,
    });
  }
};

function toResponseSchema(response: RouteResponse<any>, options: Options) {
  if (response.schema) {
    return ignoreUndefined({
      description: response.description,
      headers: response.headers && response.headers.asResponseHeaders(options),
      content: {
        "application/json": {
          schema: response.schema.toJSonSchema(options),
          examples: response.examples,
        },
      },
    });
  } else {
    return {
      description: response.description,
    };
  }
}

async function makeSchema(
  params: {
    openapiVersion: "3.0.0";
    info: { title: string; description?: string; version: string };
    servers: [
      {
        url: string;
        description?: string;
        variables?: Record<
          string,
          { default: string; description?: string; enum?: string[] }
        >;
      },
    ];
    tags: string[];
    routes: Route[];
    security?: Array<SecurityRequirement>;
    securitySchemes?: Record<
      string,
      | {
          type: "openIdConnect";
          description?: string;
          openIdConnectUrl: string;
        }
      | {
          type: "http";
          description?: string;
          scheme: string;
          bearerFormat?: string;
        }
      | {
          type: "apiKey";
          description?: string;
          name: string;
          in: "query" | "header" | "cookie";
        }
      | {
          type: "oauth2";
          description?: string;
          flows:
            | {
                implicit: {
                  authorizationUrl: string;
                  refreshUrl?: string;
                  scopes: Record<string, string>;
                };
              }
            | {
                password: {
                  tokenUrl: string;
                  refreshUrl?: string;
                  scopes: Record<string, string>;
                };
              }
            | {
                clientCredentials: {
                  tokenUrl: "https://authserver.example/token";
                  scopes: Record<string, string>;
                };
              }
            | {
                authorizationCode: {
                  authorizationUrl: string;
                  tokenUrl: string;
                  refreshUrl?: string;
                  scopes: Record<string, string>;
                };
              };
        }
    >;
    transformations?: Array<{
      jsonPath: string;
      fn: (currentValue: any) => any;
    }>;
    output:
      | { type: "stdout" }
      | { type: "file"; filename: string }
      | { type: "none" };
  },
  options: Options
) {
  return withTempDir(async (tempDir) => {
    // make sure there aren't any duplicate FixedSchemas
    if (options.type == "referenced") {
      const duplicates = FixedSchema.getDuplicateFixedSchemas();
      if (duplicates.length) {
        throw new Error(`Found duplicate fixed schemas: ${duplicates}`);
      }
    }

    await ReferenceSchema.dereferenceExternalSchemas(params.routes, tempDir);

    const sortedRoutes = [...params.routes];
    sortedRoutes.sort(
      (a, b) =>
        (a.order == undefined ? 10000 : a.order) -
        (b.order == undefined ? 10000 : b.order)
    );

    const paths = sortedRoutes.reduce(
      (acc, route) => {
        let path = acc[route.path];
        if (!path) {
          path = acc[route.path] = {} as Record<string, unknown>;
        }
        path[route.method.toLowerCase()] = routeToJsonSchema(route, options);
        return acc;
      },
      {} as Record<string, Record<string, unknown>>
    );

    const schema = {
      openapi: params.openapiVersion,
      security: params.security && securityToJsonSchema(params.security),
      info: params.info,
      tags: params.tags,
      paths,
      servers: params.servers,
      components: {
        securitySchemes: params.securitySchemes,
        schemas:
          options.type == "referenced"
            ? toSchemaObject(
                params.routes.flatMap(collectRefSchemasForRoute),
                options
              )
            : {},
      },
    };

    // dereference schema to put everything in one big schema
    let finalSchema = await normalizeSchema({
      type: options.type == "flat" ? "dereference" : "bundle",
      source: {
        type: "schema",
        schema,
      },
      target:
        // write to output file, if specified
        params.output.type == "file"
          ? { type: "file", filename: params.output.filename }
          : undefined,
      tempDir,
    });

    // apply any JsonPath transformations that may have been specified
    if (params.transformations) {
      const obj = JSON.parse(finalSchema);
      params.transformations.forEach((t) => jp.apply(obj, t.jsonPath, t.fn));
      finalSchema = await prettify(JSON.stringify(obj));
    }

    // print to console, if specified
    if (params.output.type == "stdout") {
      console.log(finalSchema);
    }
  });
}

function collectRefSchemasForSchema(schema: Schema | undefined): FixedSchema[] {
  if (schema instanceof FixedSchema) {
    return [schema].concat(
      collectRefSchemasForSchema(schema.getReferencedSchema())
    );
  } else if (schema instanceof ObjectField) {
    return Object.values(schema._fields).flatMap(collectRefSchemasForSchema);
  } else if (schema instanceof ArrayField) {
    return collectRefSchemasForSchema(schema._items);
  } else {
    return [];
  }
}

function collectRefSchemasForRoute(route: Route): FixedSchema[] {
  if ("validate" in route) {
    const schemas: (Schema | undefined)[] = [
      route.validate?.path,
      route.validate?.headers,
      route.validate?.query,
      route.validate?.body,
      route.successResponse.schema,
      ...(route.errorResponses?.map((r) => r.schema) || []),
    ];
    return schemas.flatMap(collectRefSchemasForSchema);
  } else {
    return [];
  }
}

function toSchemaObject(
  schemas: FixedSchema[],
  options: Options
): Record<string, FixedSchema> {
  return schemas.reduce(
    (acc, schema) => ({
      ...acc,
      ...schema.toComponent(options),
    }),
    {}
  );
}

const securityToJsonSchema = (reqs: SecurityRequirement[]) => [
  reqs.reduce((acc, s) => ({ ...acc, [s.name]: s.scopes }), {}),
];

const withTempDir = async <T>(fn: (tempDir: string) => Promise<T>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oas-dsl"));
  try {
    return await fn(dir);
  } finally {
    // delete temp file, ignoring errors that may occur
    fs.rm(dir, { recursive: true }).catch((err) => null);
  }
};

const ignoreUndefined = (filters: Record<string, any>) =>
  Object.keys(filters).reduce(
    (acc, key) =>
      filters[key] === undefined ? acc : { ...acc, [key]: filters[key] },
    {}
  );

function clone<T>(t: T) {
  const r = Object.create(Object.getPrototypeOf(t)) as any;
  return Object.assign(r, t) as T;
}

const prettify = (data: string) => prettier.format(data, { parser: "json" });

const toSchemaName = (label: string) =>
  label.replace(/[^A-Za-z0-9\-\._]/gm, "_");

const getFilename = (path: string) => path.substring(path.lastIndexOf("/") + 1);

const normalizeSchema = async (params: {
  tempDir: string;
  type: "bundle" | "dereference";
  source:
    | {
        type: "schema";
        schema: Record<string, unknown>;
      }
    | { type: "file"; filename: string };
  target?: { type: "file"; filename: string };
}): Promise<string> => {
  // build a temp file with the source schema, if needed
  let sourceFilename: string;
  if (params.source.type == "file") {
    sourceFilename = params.source.filename;
  } else {
    sourceFilename = randomFilename({
      dir: params.tempDir,
      prefix: "pre-normalize",
    });
    await fs.writeFile(sourceFilename, JSON.stringify(params.source.schema));
  }

  // normalize the schema
  const normalizedSchema = await $RefParser[params.type](sourceFilename, {
    continueOnError: false,
    parse: { json: true },
  });

  // prettify, save to target file (if needed) and return the schema
  const finalSchema = await prettify(JSON.stringify(normalizedSchema));
  if (params.target?.type == "file") {
    await fs.writeFile(params.target.filename, finalSchema);
  }
  return finalSchema;
};

/**Generate a random filename */
const randomFilename = (params: { dir?: string; prefix: string }) => {
  const filename = `${params.prefix}-${crypto.randomBytes(3).toString("hex")}`;
  return params.dir ? path.join(params.dir, filename) : filename;
};

export { oas, Route, Schema };
