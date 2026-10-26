/** The published SDK version, read from its package.json at build time (shown in the console header). */
import sdkPackage from "../../packages/react-native/package.json?raw";

export const SDK_VERSION: string = (JSON.parse(sdkPackage) as { version: string }).version;
