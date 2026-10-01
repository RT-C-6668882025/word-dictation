package com.rtc.worddictation;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Bundle;
import android.widget.Toast;

public class InstallResultActivity extends Activity {
    private void diag(String stage, String detail) {
        getSharedPreferences("word_dictation_updater", 0).edit().putString("stage", stage).putString("detail", detail == null ? "" : detail).putLong("time", System.currentTimeMillis()).apply();
    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    @SuppressWarnings("deprecation")
    private void handle(Intent intent) {
        int status = intent.getIntExtra(
                PackageInstaller.EXTRA_STATUS,
                PackageInstaller.STATUS_FAILURE
        );
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            diag("system_confirm", "系统请求用户确认安装");
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(confirm);
            } else {
                diag("confirm_missing", "系统未返回安装确认 Intent");
                Toast.makeText(this, "无法打开系统安装确认", Toast.LENGTH_LONG).show();
            }
            finish();
            return;
        }

        if (status != PackageInstaller.STATUS_SUCCESS) {
            String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            diag("install_failed", "status=" + status + (message == null ? "" : " · " + message));
            Toast.makeText(
                    this,
                    "安装失败" + (message == null || message.isEmpty() ? "" : "：" + message),
                    Toast.LENGTH_LONG
            ).show();
        } else {
            diag("install_success", "系统报告安装成功");
        }
        finish();
    }
}
