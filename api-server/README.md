## Usage

```
bin/dev
```

## Model Inputs

Cast request bodies accept a typed `model` object. Omit `model` to use the
default `{ "alias": "fast" }`.

```json
{
  "model": { "provider": "openrouter", "model": "z-ai/glm-5.2" }
}
```

```json
{
  "model": { "alias": "fast" }
}
```

Requests are persisted as the resolved provider-native pair in
`llm_requests.provider` and `llm_requests.model`.

### Tests

See [TESTING.md](TESTING.md)

## Dev Env setup

```
brew install dotenvx/brew/dotenvx
```
