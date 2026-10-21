package com.selah.scripturememory;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives the PackageInstaller outcome and hands it to the web layer. */
public class InstallResultReceiver extends BroadcastReceiver {
    static final String ACTION = "com.selah.scripturememory.INSTALL_RESULT";

    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Android needs the user to confirm (first install as the installer of record, or API 30 and below).
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return;
        }
        AppUpdatePlugin.deliverInstallResult(status, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    }
}
