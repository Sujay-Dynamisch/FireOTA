/**
 * @fireota/react-native — over-the-air updates for React Native from your own Firebase project.
 *
 * Zero-code setup: `npx fireota init` wires the native bundle loader and wraps your root
 * component with <FireOTAProvider>, which checks for updates and shows a ready-made prompt.
 * Everything is customizable: use the hooks and components below, or the plain API.
 */
export * from "./core";
export * from "./ui";
export { default } from "./core";
