# eslint-worker-brunch

Inspired by [eslint-brunch](https://github.com/brunch/eslint-brunch)

Adds [ESLint](http://eslint.org) support to [Brunch](http://brunch.io).

## Usage
Install the plugin via npm with `npm install --save-dev eslint-worker-brunch`.

Configuration settings can be set in any acceptable `.eslintrc.*` [configuration file formats](http://eslint.org/docs/user-guide/configuring#configuration-file-formats).
If no configuration file can be found, this plugin will fallback to default ESLint options.

```js
const sysPath = require("path");
exports.plugins = {
  eslint: {
    workers: require("os").cpus().length >> 1,
    config: {
      rules: {semi: 'always'},
    },
    overrides: {
      "*.coffee": ({data, path, map}) => {
        const basename = sysPath.basename(path, sysPath.extname(path));

        return {
          rules: {
            "no-unused-vars": [2, {
              "vars": "all"
              "args": "none"
              "caughtErrors": "none"
              "varsIgnorePattern": basename
            }]
          }
        };
      },
      "*.fbs": {
        rules: {
          "no-use-before-define": 0
          "no-invalid-this": 0
          "no-magic-numbers": 0
        }
      }
    },
    ignore: /^(?:bower_components|vendor)[/\\]/,
    pattern: /^src\/.*\.jsx?$/,
    warnOnly: false,
    formatter: 'table',
  },
};
```

## Options

| Option      | Type      | Optional  | Default             | Description                                                                                                 |
|-------------|-----------|:---------:|---------------------|-------------------------------------------------------------------------------------------------------------|
| `workers`   | `Integer` | Yes       | `undefined`         | Number of workers to use for linting. Usefull to get large project linted faster                            |
| `config`    | `Object`  | Yes       | `undefined`         | Options to pass to the ESLint engine ([docs](https://eslint.org/docs/developer-guide/nodejs-api#cliengine)) |
| `overrides` | `Object`  | Yes       | `undefined`         | Overrides eslint config per file pattern                                                                    |
| `pattern`   | `RegExp`  | Yes       | `/^app\/.*\.jsx?$/` | Pattern of file paths to be processed ([docs](http://brunch.io/docs/plugins#property-pattern-))             |
| `warnOnly`  | `Boolean` | Yes       | `true`              | Use `warn` logging level instead of `error`                                                                 |
| `formatter` | `String`  | Yes       | `'stylish'`         | Built-in formatter to use ([docs](https://eslint.org/docs/user-guide/formatters))                           |
