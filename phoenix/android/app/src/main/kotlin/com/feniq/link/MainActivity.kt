package com.feniq.link

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.feniq.link/app_update")
            .setMethodCallHandler { call, result ->
                if (call.method != "installApk") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val path = call.argument<String>("path")
                val expectedHash = call.argument<String>("sha256")
                val expectedBuild = call.argument<Number>("build")?.toLong()
                Thread {
                    try {
                        require(path != null && expectedHash != null && expectedBuild != null)
                        val root = File(filesDir, "updates").canonicalFile
                        val apk = File(path).canonicalFile
                        require(apk.path.startsWith(root.path + File.separator) && apk.isFile && apk.extension == "apk")
                        val digest = MessageDigest.getInstance("SHA-256")
                        apk.inputStream().use { stream ->
                            val buffer = ByteArray(65536)
                            var count = stream.read(buffer)
                            while (count >= 0) {
                                if (count > 0) digest.update(buffer, 0, count)
                                count = stream.read(buffer)
                            }
                        }
                        require(hex(digest.digest()).equals(expectedHash, ignoreCase = true))
                        @Suppress("DEPRECATION")
                        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
                        @Suppress("DEPRECATION")
                        val candidate = packageManager.getPackageArchiveInfo(apk.path, flags)
                        @Suppress("DEPRECATION")
                        val installed = packageManager.getPackageInfo(packageName, flags)
                        require(candidate != null && candidate.packageName == packageName)
                        require(version(candidate) == expectedBuild && expectedBuild > version(installed))
                        val installedSigners = signers(installed)
                        require(installedSigners.isNotEmpty() && installedSigners == signers(candidate))
                        runOnUiThread {
                            try {
                                if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                                    startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                                    result.success("permission_required")
                                } else {
                                    val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
                                    val intent = Intent(Intent.ACTION_VIEW).apply {
                                        setDataAndType(uri, "application/vnd.android.package-archive")
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                    startActivity(intent)
                                    result.success("install_started")
                                }
                            } catch (_: Exception) {
                                result.error("INSTALL_UNAVAILABLE", "Could not open the Android installer.", null)
                            }
                        }
                    } catch (_: Exception) {
                        runOnUiThread { result.error("INVALID_APK", "The update does not match the installed app and signed manifest.", null) }
                    }
                }.start()
            }
    }

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }

    @Suppress("DEPRECATION")
    private fun version(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        return signatures?.map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }?.toSet() ?: emptySet()
    }
}
