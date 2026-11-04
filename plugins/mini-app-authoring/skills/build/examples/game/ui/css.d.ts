// The host's artifact build bundles the stylesheet; the compiler only needs to know that the
// specifier is a module, because TypeScript checks side-effect imports.
declare module '*.css'
