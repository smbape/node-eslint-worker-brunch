"use strict";

// Documentation for Brunch plugins:
// https://github.com/brunch/brunch/blob/master/docs/plugins.md

const sysPath = require("path");
const anymatch = require("anymatch");
const minimatch = require("minimatch");

const clone = require("lodash/clone");
const each = require("lodash/each");
const merge = require("lodash/merge");

const Module = require("module");

const {fork, spawn} = require("child_process");
const semLib = require("sem-lib");

const argv = process.execArgv.join();
const isDebug = argv.includes("--inspect") || argv.includes("--debug");

const resolve = (name, directory, filepath) => {
    const relativeMod = new Module();
    const filename = sysPath.join(directory, filepath);

    relativeMod.id = filename;
    relativeMod.filename = filename;
    relativeMod.paths = Module._nodeModulePaths(directory).concat(Module._nodeModulePaths(__dirname));

    try {
        return Module._resolveFilename(name, relativeMod);
    } catch ( err ) {
        return null;
    }
};

const isNotDebugArg = arg => {
    return arg.indexOf("--inspect") === -1 && arg.indexOf("--debug") === -1;
};

class EslintWorkerPlugin {
    constructor(config) {
        config = config.plugins.eslint || {};
        const {warnOnly, overrides, ignore, config: cfg, pattern, formatter} = config;
        const options = clone(cfg);

        Object.assign(this, {
            warnOnly: typeof warnOnly === "boolean" ? warnOnly : true,
            overrides
        });

        if (ignore) {
            this.isIgnored = anymatch(ignore);
        } else if (cfg.conventions && cfg.conventions.vendor) {
            this.isIgnored = cfg.conventions.vendor;
        } else {
            this.isIgnored = anymatch(/^(?:bower_components|vendor)[/\\]/);
        }

        if (pattern) {
            this.pattern = anymatch(pattern);
        }

        this.options = options;
        this.formatter = formatter;
        this.CLIEngine = resolve("eslint", process.cwd(), ".eslintrc");

        let {workers} = config;
        if (!isNaN(workers) && (workers < 0 || !isFinite(workers))) {
            // -1 for the main process
            // -1 to let the user still be able to use his computer
            workers = require("os").cpus().length - 2;
            if (workers < 1) {
                workers = 1;
            }
        }

        if (this.isWorker || !workers) {
            this.workers = false;
        } else {
            const workerFile = config.worker ? config.worker : sysPath.resolve(__dirname, "worker.js");

            // This is intented
            // workers are shared accross instances
            // otherwise they will be created for every instances
            const start = EslintWorkerPlugin.prototype.workers ? EslintWorkerPlugin.prototype.workers.length : 0;

            if (start === 0) {
                EslintWorkerPlugin.prototype.workers = new Array(workers);
                EslintWorkerPlugin.prototype.semaphore = semLib.semCreate(workers, true);
            } else if (start < workers) {
                const add = workers - start;
                EslintWorkerPlugin.prototype.workers.length += add;
                EslintWorkerPlugin.prototype.semaphore._capacity += add;
            }

            const spawnOptions = {
                stdio: ["inherit", "inherit", "inherit", "ipc"]
            };

            let parameters = [];
            let cp, command;

            if (isDebug) {
                cp = spawn;
                command = process.execPath;

                // Remove the debug switches since
                // this might cause fork failed due to debug port already in used
                parameters = process.execArgv.filter(isNotDebugArg).concat([workerFile], parameters);

                if (process._eval != null) {
                    const index = parameters.lastIndexOf(process._eval);
                    if (index > 0) {
                        // Remove the -e switch to avoid fork bombing ourselves.
                        parameters.splice(index - 1, 2);
                    }
                }
            } else {
                cp = fork;
                command = workerFile;
            }

            for (let i = start; i < workers; i++) {
                EslintWorkerPlugin.prototype.workers[i] = cp(command, parameters, spawnOptions);
            }
        }
    }

    lint(params) {
        return new Promise((resolve, reject) => {
            this.lintcb(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    lintcb(params, callback) {
        const {path} = params;

        if (this.isIgnored(path)) {
            callback();
            return;
        }

        if (this.pattern) {
            let lint;

            switch (Object.prototype.toString.call(this.pattern)) {
                case "[object Function]":
                    lint = this.pattern(path);
                    break;
                case "[object RegExp]":
                    lint = this.pattern.test(path);
                    break;
                case "[object String]":
                    lint = this.pattern === path;
                    break;
                default:
                    // Invalid pattern
            }

            if (!lint) {
                callback();
                return;
            }
        }

        let config = this.options;
        let limit = 10;
        while (typeof config === "function" && limit !== 0) {
            config = config(params);
            limit--;
        }

        if (this.overrides) {
            config = clone(config);
            each(this.overrides, (options, pattern) => {
                if (minimatch(sysPath.normalize(path), pattern, {
                        nocase: true,
                        matchBase: true
                    })) {
                    limit = 10;
                    while (typeof options === "function") {
                        options = options(params);
                        limit--;
                    }

                    merge(config, options);
                }
            });
        }

        const args = [this.CLIEngine, config, params.data, path, this.formatter];

        if (!this.workers || this.workers.length === 0) {
            const result = this.internal_lint(...args);
            this.internal_result(result, callback);
            return;
        }

        this.semaphore.semTake(() => {
            const worker = this.workers.shift();

            const handleError = err => {
                worker.removeListener("error", handleError);
                worker.removeListener("message", handleMessage);

                this.workers.push(worker);
                this.semaphore.semGive();
                this.internal_result({
                    message: err
                }, callback);
            };

            const handleMessage = message => {
                worker.removeListener("error", handleError);
                worker.removeListener("message", handleMessage);

                const result = JSON.parse(message);
                this.workers.push(worker);
                this.semaphore.semGive();
                this.internal_result(result, callback);
            };

            worker.on("error", handleError);
            worker.on("message", handleMessage);

            worker.send(JSON.stringify(args));
        });
    }

    teardown() {
        if (this.workers && this.workers.length !== 0) {
            this.workers.forEach(child => {
                child.kill();
            });
            this.workers.length = 0;
        }
    }

    internal_result(result, callback) {
        if (this.warnOnly && result.message) {
            result.message = `warn: ${ result.message }`;
        }

        callback(result.message, result.output);
    }

    internal_lint(engine, config, data, path, formatter) {
        const {CLIEngine} = require(engine);
        const linter = new CLIEngine(config);
        const report = linter.executeOnText(data, path);

        const [result] = report.results;
        const output = result ? result.output : undefined;

        let message;

        if (report.errorCount !== 0 || report.warningCount !== 0) {
            message = `ESLint reported:\n${ CLIEngine.getFormatter(formatter)(report.results) }`;
        }

        return {
            output,
            message
        };
    }
}

Object.assign(EslintWorkerPlugin.prototype, {
    brunchPlugin: true,
    type: "javascript"
});

EslintWorkerPlugin.brunchPluginName = "eslint-worker";

module.exports = EslintWorkerPlugin;
