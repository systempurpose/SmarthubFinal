package com.smarthub.diagnostics;

import android.content.Context;
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

public class StorageAnalysisActivity extends AppCompatActivity {

    private ListView lvApps;
    private TextView tvSummary;
    private LinearLayout emptyState;
    private TextView tvEmptyTitle;
    private TextView tvEmptyMessage;
    private ProgressBar progressBar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_storage_analysis);

        lvApps = findViewById(R.id.lvApps);
        tvSummary = findViewById(R.id.tvSummary);
        progressBar = findViewById(R.id.progressBar);
        emptyState = findViewById(R.id.emptyState);
        tvEmptyTitle = findViewById(R.id.tvEmptyTitle);
        tvEmptyMessage = findViewById(R.id.tvEmptyMessage);

        loadAndDisplayData();
    }

    private void loadAndDisplayData() {
        // Show loading state
        tvSummary.setText("📡 Waiting for Android app data...");
        progressBar.setVisibility(View.VISIBLE);
        lvApps.setVisibility(View.GONE);
        emptyState.setVisibility(View.GONE);

        new Handler().postDelayed(() -> {
            File dir = getExternalFilesDir(null);
            if (dir == null) dir = getFilesDir();
            File reportFile = new File(dir, "smarthub_diagnostics.json");

            if (!reportFile.exists()) {
                // Show friendly empty state
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.VISIBLE);
                tvEmptyTitle.setText("📭 No Report Found");
                tvEmptyMessage.setText("Connect your device to the SmartHub desktop app and run a storage scan.");
                return;
            }

            try {
                StringBuilder sb = new StringBuilder();
                BufferedReader br = new BufferedReader(new FileReader(reportFile));
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();

                JSONObject root = new JSONObject(sb.toString());
                JSONArray appStorage = root.optJSONArray("appStorage");

                if (appStorage == null || appStorage.length() == 0) {
                    progressBar.setVisibility(View.GONE);
                    emptyState.setVisibility(View.VISIBLE);
                    tvEmptyTitle.setText("📭 No App Data");
                    tvEmptyMessage.setText("No storage data found for installed apps.");
                    return;
                }

                List<AppStorageItem> items = new ArrayList<>();
                PackageManager pm = getPackageManager();
                for (int i = 0; i < appStorage.length(); i++) {
                    JSONObject obj = appStorage.getJSONObject(i);
                    AppStorageItem item = new AppStorageItem();
                    item.packageName = obj.getString("packageName");
                    item.appName = obj.getString("appName");
                    item.totalBytes = obj.getLong("totalBytes");
                    item.dataBytes = obj.getLong("dataBytes");
                    item.cacheBytes = obj.getLong("cacheBytes");
                    item.codeBytes = obj.getLong("codeBytes");
                    try {
                        item.icon = pm.getApplicationIcon(item.packageName);
                    } catch (Exception e) {
                        item.icon = getDrawable(android.R.drawable.sym_def_app_icon);
                    }
                    items.add(item);
                }

                Collections.sort(items, (o1, o2) -> Long.compare(o2.totalBytes, o1.totalBytes));
                if (items.size() > 20) items = items.subList(0, 20);

                long total = 0;
                for (AppStorageItem item : items) total += item.totalBytes;

                tvSummary.setText("📊 Top " + items.size() + " apps — " + formatBytes(total) + " total");
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.GONE);
                lvApps.setVisibility(View.VISIBLE);

                AppAdapter adapter = new AppAdapter(this, items);
                lvApps.setAdapter(adapter);

            } catch (Exception e) {
                progressBar.setVisibility(View.GONE);
                emptyState.setVisibility(View.VISIBLE);
                tvEmptyTitle.setText("⚠️ Error");
                tvEmptyMessage.setText("Failed to load storage data: " + e.getMessage());
            }
        }, 1000); // slight delay to show loading state
    }

    private String formatBytes(long bytes) {
        if (bytes >= 1024 * 1024 * 1024) return String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        if (bytes >= 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        if (bytes >= 1024) return String.format("%.1f KB", bytes / 1024.0);
        return bytes + " B";
    }

    private static class AppStorageItem {
        String packageName;
        String appName;
        long totalBytes;
        long dataBytes;
        long cacheBytes;
        long codeBytes;
        Drawable icon;
    }

    private class AppAdapter extends ArrayAdapter<AppStorageItem> {
        public AppAdapter(Context context, List<AppStorageItem> items) {
            super(context, 0, items);
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            if (convertView == null) {
                convertView = LayoutInflater.from(getContext()).inflate(android.R.layout.simple_list_item_2, parent, false);
            }
            AppStorageItem item = getItem(position);
            TextView text1 = convertView.findViewById(android.R.id.text1);
            TextView text2 = convertView.findViewById(android.R.id.text2);
            text1.setText(item.appName);
            text2.setText("📁 Total: " + formatBytes(item.totalBytes) + " | Data: " + formatBytes(item.dataBytes) + " | Cache: " + formatBytes(item.cacheBytes));
            if (item.icon != null) {
                text1.setCompoundDrawablesWithIntrinsicBounds(item.icon, null, null, null);
                text1.setCompoundDrawablePadding(16);
            }
            return convertView;
        }
    }
}