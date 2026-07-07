package com.smarthub.diagnostics;

import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.Handler;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.LinearLayout;
import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class AppSecurityScanActivity extends AppCompatActivity {

    private ListView lvApps;
    private TextView tvStatus;
    private TextView tvEmptyTitle;
    private TextView tvEmptyMessage;
    private LinearLayout emptyState;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_app_security_scan);

        lvApps = findViewById(R.id.lvApps);
        tvStatus = findViewById(R.id.tvStatus);
        progressBar = findViewById(R.id.progressBar);
        emptyState = findViewById(R.id.emptyState);
        tvEmptyTitle = findViewById(R.id.tvEmptyTitle);
        tvEmptyMessage = findViewById(R.id.tvEmptyMessage);

        loadAndDisplayData();
    }

    private void loadAndDisplayData() {
        // Show loading state
        tvStatus.setText("📡 Waiting for Android app data...");
        progressBar.setVisibility(View.VISIBLE);
        lvApps.setVisibility(View.GONE);
        emptyState.setVisibility(View.GONE);

        new Handler().postDelayed(() -> {
            File dir = getExternalFilesDir(null);
            if (dir == null) dir = getFilesDir();
            File reportFile = new File(dir, "smarthub_diagnostics.json");

            if (!reportFile.exists()) {
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.VISIBLE);
                tvEmptyTitle.setText("📭 No Report Found");
                tvEmptyMessage.setText("Connect your device to the SmartHub desktop app and run an App Security Scan.");
                return;
            }

            try {
                StringBuilder sb = new StringBuilder();
                BufferedReader br = new BufferedReader(new FileReader(reportFile));
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();

                JSONObject root = new JSONObject(sb.toString());
                JSONArray appSecurityMeta = root.optJSONArray("appSecurityMeta");

                if (appSecurityMeta == null || appSecurityMeta.length() == 0) {
                    progressBar.setVisibility(View.GONE);
                    emptyState.setVisibility(View.VISIBLE);
                    tvEmptyTitle.setText("🛡️ No Security Data");
                    tvEmptyMessage.setText("No app security metadata found in the report.");
                    return;
                }

                List<AppSecurityItem> suspiciousApps = new ArrayList<>();
                PackageManager pm = getPackageManager();

                for (int i = 0; i < appSecurityMeta.length(); i++) {
                    JSONObject obj = appSecurityMeta.getJSONObject(i);
                    String verdict = obj.optString("securityVerdict", "unknown");
                    if (!verdict.equals("safe")) {
                        AppSecurityItem item = new AppSecurityItem();
                        item.packageName = obj.getString("packageName");
                        item.appName = obj.optString("appName", item.packageName);
                        item.verdict = verdict;
                        item.dangerousPerms = obj.optInt("dangerousPermissionsCount", 0);
                        item.isSystem = obj.optBoolean("isSystem", false);
                        item.accessibility = obj.optBoolean("accessibilityEnabled", false);
                        item.deviceAdmin = obj.optBoolean("deviceAdminEnabled", false);
                        try {
                            item.icon = pm.getApplicationIcon(item.packageName);
                        } catch (Exception e) {
                            item.icon = getDrawable(android.R.drawable.sym_def_app_icon);
                        }
                        suspiciousApps.add(item);
                    }
                }

                Collections.sort(suspiciousApps, (o1, o2) -> {
                    if (o1.verdict.equals("suspicious") && !o2.verdict.equals("suspicious")) return -1;
                    if (!o1.verdict.equals("suspicious") && o2.verdict.equals("suspicious")) return 1;
                    return Integer.compare(o2.dangerousPerms, o1.dangerousPerms);
                });

                if (suspiciousApps.isEmpty()) {
                    progressBar.setVisibility(View.GONE);
                    emptyState.setVisibility(View.VISIBLE);
                    tvEmptyTitle.setText("✅ All Clear");
                    tvEmptyMessage.setText("No suspicious apps found. Your device is safe!");
                    return;
                }

                tvStatus.setText("⚠️ " + suspiciousApps.size() + " app(s) require attention");
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.GONE);
                lvApps.setVisibility(View.VISIBLE);

                AppAdapter adapter = new AppAdapter(this, suspiciousApps);
                lvApps.setAdapter(adapter);

            } catch (Exception e) {
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.VISIBLE);
                tvEmptyTitle.setText("⚠️ Error");
                tvEmptyMessage.setText("Failed to load security data: " + e.getMessage());
            }
        }, 1000); // slight delay to show loading state
    }

    private static class AppSecurityItem {
        String packageName;
        String appName;
        String verdict;
        int dangerousPerms;
        boolean isSystem;
        boolean accessibility;
        boolean deviceAdmin;
        Drawable icon;
    }

    private class AppAdapter extends ArrayAdapter<AppSecurityItem> {
        public AppAdapter(AppSecurityScanActivity context, List<AppSecurityItem> items) {
            super(context, 0, items);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            if (convertView == null) {
                convertView = LayoutInflater.from(getContext()).inflate(android.R.layout.simple_list_item_2, parent, false);
            }
            AppSecurityItem item = getItem(position);
            TextView text1 = convertView.findViewById(android.R.id.text1);
            TextView text2 = convertView.findViewById(android.R.id.text2);

            String verdictIcon = item.verdict.equals("suspicious") ? "⚠️" : "❓";
            String verdictText = item.verdict.equals("suspicious") ? "SUSPICIOUS" : "Unknown risk";
            text1.setText(verdictIcon + " " + item.appName + " (" + verdictText + ")");

            String details = "";
            if (item.dangerousPerms > 0) details += "🔓 " + item.dangerousPerms + " dangerous perms ";
            if (item.accessibility) details += "♿ Accessibility ";
            if (item.deviceAdmin) details += "🔒 Device Admin ";
            if (details.isEmpty()) details = "No extra flags";
            text2.setText(details.trim());

            if (item.icon != null) {
                text1.setCompoundDrawablesWithIntrinsicBounds(item.icon, null, null, null);
                text1.setCompoundDrawablePadding(16);
            }
            return convertView;
        }
    }
}