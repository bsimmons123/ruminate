package com.selah.scripturememory;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads, verifies and installs a newer Ruminate APK. The web layer decides when an update is
 * wanted (src/update.ts); this plugin only does the work Android keeps out of a WebView.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String PACKAGE_NAME = "com.selah.scripturememory";
    private static AppUpdatePlugin current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @Override
    public void load() { current = this; }

    static void deliverInstallResult(int status, String message) {
        AppUpdatePlugin plugin = current;
        if (plugin == null) return;
        JSObject result = new JSObject();
        result.put("status", status);
        result.put("message", message);
        plugin.notifyListeners("installResult", result);
    }

    private File updateDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return dir;
    }

    private void cleanup() {
        File[] files = updateDir().listFiles();
        if (files != null) for (File file : files) file.delete();
    }

    private boolean canInstall() { return getContext().getPackageManager().canRequestPackageInstalls(); }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("versionCode", BuildConfig.VERSION_CODE);
        info.put("versionName", BuildConfig.VERSION_NAME);
        info.put("updateSource", BuildConfig.UPDATE_SOURCE);
        info.put("canInstall", canInstall());
        call.resolve(info);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + PACKAGE_NAME)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(market); }
        catch (Exception e) {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + PACKAGE_NAME)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        Integer versionCode = call.getInt("versionCode");
        if (url == null || versionCode == null) { call.reject("A url and versionCode are required.", "DOWNLOAD_FAILED"); return; }
        // Ask for "Allow from this source" before spending a download on an install Android would refuse.
        if (!canInstall()) { call.reject("Allow Ruminate to install apps first.", "NEEDS_PERMISSION"); return; }
        String releaseSha = call.getString("sha256");
        long size = call.getLong("size", 0L);
        worker.execute(() -> {
            cleanup();
            File file = new File(updateDir(), "ruminate-" + versionCode + ".apk");
            try {
                String headerSha = download(url, file, size);
                UpdateVerifier.Result verification = UpdateVerifier.verify(file, headerSha, releaseSha, size);
                if (!verification.ok) { file.delete(); call.reject(verification.reason, "VERIFY_FAILED"); return; }
                try { installWithSession(file); }
                catch (Exception sessionFailure) { installWithIntent(file); }
                JSObject result = new JSObject();
                result.put("status", "installing");
                call.resolve(result);
            } catch (Exception e) {
                // Never leave a partial APK behind.
                file.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "The download failed.", "DOWNLOAD_FAILED");
            }
        });
    }

    /** Streams the APK to [file] and returns the server's X-Sha256 header, if any. */
    private String download(String address, File file, long expectedSize) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        try {
            if (connection.getResponseCode() != 200) throw new Exception("The server answered " + connection.getResponseCode() + ".");
            long total = connection.getContentLengthLong() > 0 ? connection.getContentLengthLong() : expectedSize;
            long read = 0, lastReported = 0;
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) >= 0) {
                    out.write(buffer, 0, n);
                    read += n;
                    if (read - lastReported > 256 * 1024 || read == total) {
                        lastReported = read;
                        JSObject progress = new JSObject();
                        progress.put("read", read);
                        progress.put("total", total);
                        notifyListeners("downloadProgress", progress);
                    }
                }
            }
            return connection.getHeaderField("X-Sha256");
        } finally {
            connection.disconnect();
        }
    }

    private void installWithSession(File file) throws Exception {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        int id;
        try { id = installer.createSession(sessionParams(true)); }
        catch (SecurityException e) { id = installer.createSession(sessionParams(false)); }
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new java.io.FileInputStream(file); OutputStream out = session.openWrite("ruminate.apk", 0, file.length())) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
                session.fsync(out);
            }
            // The system fills in status extras, so this must be mutable.
            PendingIntent callback = PendingIntent.getBroadcast(
                getContext(), id, new Intent(getContext(), InstallResultReceiver.class).setAction(InstallResultReceiver.ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            session.commit(callback.getIntentSender());
        }
    }

    private PackageInstaller.SessionParams sessionParams(boolean withOwnership) {
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        // Once Ruminate is the installer of record, Android can update it without the confirmation sheet.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && withOwnership) params.setRequestUpdateOwnership(true);
        return params;
    }

    private void installWithIntent(File file) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        getContext().startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
    }
}
