package dev.fireota.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// The classic ReactPackage API is deprecated in RN 0.87 but still supported through the interop layer.
@Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
class FireOTAPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(FireOTAModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
