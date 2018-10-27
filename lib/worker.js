const EslintWorkerPlugin = require("./EslintWorkerPlugin");

process.on("message", args => {
    args = JSON.parse(args);
    const result = EslintWorkerPlugin.prototype.internal_lint.apply(null, args);
    process.send(JSON.stringify(result));
});

// Keep worker alive
setInterval(Function.prototype, 3600 * 1000);
