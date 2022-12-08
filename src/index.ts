import prettier from "prettier";

type JsonSchema = Record<string, unknown>;
type SecurityRequirement = { name: string; scopes: string[] };

interface RouteResponse<S> {
  statusCode: S;
  description: string;
  schema: Schema;
}

interface Route {
  operationId: string;
  description: string;
  notes?: string;
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
  successResponse: RouteResponse<200 | 201 | 204>;
  // fell free to add more error status codes if needed
  errorResponses?: Array<RouteResponse<400 | 401 | 403 | 404 | 500>>;
  produces?: string;
  security?: Array<SecurityRequirement>;
  order?: number;
}

abstract class Schema {
  protected _description?: string;
  _required?: boolean;
  _explode?: boolean;
  protected _example?: any;
  abstract toJSonSchema(): JsonSchema;
  required() {
    const that = clone(this);
    that._required = true;
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
    if (this._required) {
      return that.required();
    } else {
      return that;
    }
  }
  toJSonSchema(): JsonSchema {
    const { type, format, ...ownFields } = this.ownFields();
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
    };
  }
  abstract ownFields(): { type: string } & Record<string, any>;
}

class FixedSchema extends Schema {
  protected _schema: Schema;
  protected _label?: string;

  constructor(schema: Schema, label: string) {
    super();
    this._schema = schema;
    this._label = label;
  }
  toJSonSchema(): JsonSchema {
    return this._schema.toJSonSchema();
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

class ObjectField extends ExtensibleSchema {
  _fields: Record<string, Schema>;

  constructor(fields?: Record<string, Schema>) {
    super();
    this._fields = fields || {};
  }

  asParameterList(parameterType: "path" | "query" | "header" | "cookie") {
    const fields = this._fields;
    return Object.keys(fields).map((key) => {
      const { description, required, ...schema } = fields[key].toJSonSchema();
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

  ownFields() {
    const fields = this._fields;
    const requiredFields = Object.keys(fields).filter((key) => {
      return fields[key]._required;
    });
    return {
      type: "object",
      description: this._description,
      properties: Object.keys(fields).reduce(
        (acc, key) => ({
          ...acc,
          [key]: fields[key].toJSonSchema(),
        }),
        {}
      ),
      required: requiredFields.length ? requiredFields : undefined,
    };
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
  ownFields() {
    return {
      type: "array",
      items: this._items?.toJSonSchema(),
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
  makeSchema,
};

const routeToJsonSchema = (route: Route): JsonSchema => {
  const errorResponses = route.errorResponses?.reduce((acc, response) => ({
    ...acc,
    [response.statusCode]: toResponseSchema(response),
  }));

  const pathAsTag = /\/([^\/]+)/.exec(route.path)?.[1];
  const parameters = [
    ...(route.validate?.path?.asParameterList("path") || []),
    ...(route.validate?.query?.asParameterList("query") || []),
    ...(route.validate?.headers?.asParameterList("header") || []),
  ];
  return ignoreUndefined({
    summary: route.description,
    operationId: route.operationId,
    parameters: parameters.length ? parameters : undefined,
    requestBody: route.validate?.body && {
      content: {
        "application/json": {
          schema: route.validate.body.toJSonSchema(),
        },
      },
    },
    tags: route.tags || (pathAsTag ? [pathAsTag] : undefined),
    responses: {
      [route.successResponse.statusCode]: toResponseSchema(
        route.successResponse
      ),
      ...(route.errorResponses || []).reduce(
        (acc, response) => ({
          ...acc,
          [response.statusCode]: toResponseSchema(response),
        }),
        {}
      ),
    },
    "x-order": route.order,
  });
};

function toResponseSchema(response: RouteResponse<any>) {
  return {
    description: response.description,
    content: {
      "application/json": {
        schema: response.schema.toJSonSchema(),
      },
    },
  };
}

function makeSchema(params: {
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
    }
  ];
  tags: string[];
  routes: Route[];
  security?: Array<SecurityRequirement>;
  securitySchemes?: Record<
    string,
    | {
        type: "apiKey" | "http" | "oauth2" | "openIdConnect";
        description?: string;
        name?: string;
        in?: "query" | "header" | "cookie";
      }
    | {
        type: "oauth2";
        description?: string;
        name?: string;
        in?: "query" | "header" | "cookie";
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
}) {
  const sortedRoutes = [...params.routes];
  sortedRoutes.sort(
    (a, b) =>
      (a.order == undefined ? 10000 : a.order) -
      (b.order == undefined ? 10000 : b.order)
  );

  const paths = sortedRoutes.reduce((acc, route) => {
    let path = acc[route.path];
    if (!path) {
      path = acc[route.path] = {} as Record<string, unknown>;
    }
    path[route.method.toLowerCase()] = routeToJsonSchema(route);
    return acc;
  }, {} as Record<string, Record<string, unknown>>);

  const schema = {
    openapi: params.openapiVersion,
    security:
      params.security && params.security.map((s) => ({ [s.name]: s.scopes })),
    info: params.info,
    tags: params.tags,
    paths,
    servers: params.servers,
    components: { securitySchemes: params.securitySchemes, schemas: {} },
  };

  return prettify(JSON.stringify(schema));
}

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

export { oas, Route, Schema };
