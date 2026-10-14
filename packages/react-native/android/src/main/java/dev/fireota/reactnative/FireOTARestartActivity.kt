package dev.fireota.reactnative

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Process

/** Runs in its own process (":fireota_restart"): kills the app process, then relaunches it. */
class FireOTARestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Process.killProcess(intent.getIntExtra(EXTRA_PID, -1))
    val launch: Intent? = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(EXTRA_LAUNCH, Intent::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_LAUNCH)
    }
    launch?.let { startActivity(it) }
    finish()
    Runtime.getRuntime().exit(0)
  }

  companion object {
    const val EXTRA_LAUNCH = "dev.fireota.launch"
    const val EXTRA_PID = "dev.fireota.pid"
  }
}
