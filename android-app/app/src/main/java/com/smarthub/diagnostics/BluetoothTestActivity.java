package com.smarthub.diagnostics;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.UUID;

public class BluetoothTestActivity extends AppCompatActivity {
    private static final UUID MY_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String NAME = "SmartHub";
    private BluetoothAdapter adapter;
    private TextView statusText;
    private Handler handler = new Handler();
    private boolean running = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_bluetooth_test);

        statusText = findViewById(R.id.statusText);
        adapter = BluetoothAdapter.getDefaultAdapter();

        if (adapter == null) {
            statusText.setText("Bluetooth not supported");
            finish();
            return;
        }

        if (!adapter.isEnabled()) {
            statusText.setText("Please enable Bluetooth");
            return;
        }

        statusText.setText("Listening for Bluetooth file...\nSend a file containing 'success'");
        startServer();
    }

    private void startServer() {
        new Thread(() -> {
            try (BluetoothServerSocket serverSocket =
                    adapter.listenUsingRfcommWithServiceRecord(NAME, MY_UUID)) {
                running = true;
                while (running) {
                    BluetoothSocket socket = serverSocket.accept();
                    if (socket != null) {
                        handleClient(socket);
                    }
                }
            } catch (Exception e) {
                handler.post(() -> statusText.setText("Error: " + e.getMessage()));
            }
        }).start();
    }

    private void handleClient(BluetoothSocket socket) {
        try {
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
            String line = reader.readLine();
            if (line != null && line.contains("success")) {
                Log.i("BluetoothTest", "SUCCESS");
                handler.post(() -> {
                    statusText.setText("✅ File received with 'success'! Test passed.");
                    Toast.makeText(BluetoothTestActivity.this, "File received successfully!", Toast.LENGTH_LONG).show();
                    running = false;
                    handler.postDelayed(BluetoothTestActivity.this::finish, 2000);
                });
            } else {
                handler.post(() -> statusText.setText("❌ Received: " + line + "\nExpected 'success'"));
                Toast.makeText(BluetoothTestActivity.this, "File content invalid. Expected 'success'.", Toast.LENGTH_LONG).show();
            }
            socket.close();
        } catch (Exception e) {
            handler.post(() -> statusText.setText("Error: " + e.getMessage()));
            Log.e("BluetoothTest", "Error handling client", e);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        running = false;
    }
}