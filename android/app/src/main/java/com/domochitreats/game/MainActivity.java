package com.domochitreats.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The game's own plugin: the screen's turning (Settings → Landscape / Portrait / Auto-rotate).
        registerPlugin(OrientationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
