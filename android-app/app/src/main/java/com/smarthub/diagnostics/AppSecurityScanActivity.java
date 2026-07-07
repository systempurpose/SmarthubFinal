package com.smarthub.diagnostics;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;

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
    private TextView tvEmpty;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_app_security_scan);

        lvApps = findViewById(R.id.lvApps);
        tvStatus = findViewById(R.id.tvStatus);
        tvEmpty = findViewById(R.id.tvEmpty);
        progressBar = findViewById(R.id.progressBar);

        loadAndDisplayData();
    }

    private void loadAndDisplayData() {
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = getFilesDir();
        File reportFile = new File(dir, "smarthub_diagnostics.json");

        if (!reportFile.exists()) {
            tvStatus.setText("No report found. Connect to desktop and run a scan.");
            progressBar.setVisibility(View.GONE);
            tvEmpty.setVisibility(View.VISIBLE);
            tvEmpty.setText("⚠️ No report available");
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
                tvStatus.setText("No security metadata available.");
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(View.VISIBLE);
                tvEmpty.setText("⚠️ No app data");
                return;
            }

            // Filter only suspicious or unknown apps
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

            // Sort by verdict (suspicious first) then by dangerous perms
            Collections.sort(suspiciousApps, (o1, o2) -> {
                if (o1.verdict.equals("suspicious") && !o2.verdict.equals("suspicious")) return -1;
                if (!o1.verdict.equals("suspicious") && o2.verdict.equals("suspicious")) return 1;
                return Integer.compare(o2.dangerousPerms, o1.dangerousPerms);
            });

            if (suspiciousApps.isEmpty()) {
                tvStatus.setText("✅ All apps are safe!");
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(View.VISIBLE);
                tvEmpty.setText("✅ No suspicious apps found");
                return;
            }

            tvStatus.setText("⚠️ " + suspiciousApps.size() + " app(s) require attention");
            progressBar.setVisibility(View.GONE);

            AppAdapter adapter = new AppAdapter(this, suspiciousApps);
            lvApps.setAdapter(adapter);

        } catch (Exception e) {
            tvStatus.setText("Error: " + e.getMessage());
            progressBar.setVisibility(View.GONE);
            tvEmpty.setVisibility(View.VISIBLE);
            tvEmpty.setText("❌ Error loading data");
        }
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