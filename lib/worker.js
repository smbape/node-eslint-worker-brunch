const EslintWorkerPlugin = require("./EslintWorkerPlugin");

EslintWorkerPlugin.prototype.isWorker = true;
const plugin = Object.create(EslintWorkerPlugin.prototype);

if (process.argv[2]) {
    plugin.options = JSON.parse(process.argv[2]);
}

process.on("message", args => {
    const result = plugin.internal_lint(...JSON.parse(args));
    process.send(JSON.stringify(result));
});

// Keep the worker alive
setInterval(Function.prototype, 3600 * 1000);
