module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  // Neutralise `import.meta`. Some deps (e.g. zustand's devtools middleware, pulled in
  // transitively by the `zustand/middleware` barrel even though we only use `persist`)
  // reference `import.meta.env` — a Vite-ism that's a PARSE-time crash in Metro's classic
  // web script, which blanks the whole web app. React Native never uses import.meta, so
  // replacing it with an empty object is safe on every platform.
  plugins.push(function replaceImportMeta() {
    return {
      name: "replace-import-meta",
      visitor: {
        MetaProperty(path) {
          const n = path.node;
          if (n.meta && n.meta.name === "import" && n.property && n.property.name === "meta") {
            path.replaceWithSourceString("({})");
          }
        },
      },
    };
  });

  // Reanimated/worklets plugin must stay LAST.
  plugins.push("react-native-worklets/plugin");

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};
