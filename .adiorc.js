export default {
  ignore: {
    src: ["~tests", "~", "@/src"],
    dependencies: ["@types/node", "typescript"],
    devDependencies: true,
    peerDependencies: true
  },
  ignoreDirs: ["node_modules/", "dist/", "build/", "nextjs/"],
  packages: ["./"]
};
