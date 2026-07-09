const I18N = {
    en: {
        settingsTitle: '⚙️ Settings',
        settingsSubtitle: 'Customize SmartHub to your preferences.',
        languageLabel: '🌐 Language',
        languageHint: 'UI language (translations are work in progress).',
        themeLabel: '🎨 Theme Color',
        themeHint: 'Choose a primary color for buttons and highlights.',
        adbLabel: '📂 ADB Path (optional)',
        adbHint: 'Leave empty to use ADB from system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (seconds)',
        refreshHint: 'Interval for automatic device info updates.',
        saveBtn: '💾 Save Settings',
        resetBtn: '↩️ Reset to Defaults',
        savedMsg: '✅ Settings saved successfully!',
        resetMsg: '✅ Settings reset to defaults.',
        'app.title': 'SmartHub',
        'nav.dashboard': 'Dashboard',
        'nav.hardwareTests': 'Hardware Tests',
        'nav.connectionTroubleshoot': 'Connection Troubleshoot',
        'nav.bsod': 'BSOD Diagnosis',
        'nav.advanced': 'Advanced',
        'nav.deviceInfo': 'Device Info',
        'nav.repairs': 'Repairs',
        'nav.aiConclusion': 'AI Conclusion',
        'nav.settings': 'Settings',
        'connection.disconnected': 'Disconnected',
        'connection.connected': 'Connected',
        'loading.text': 'Loading…',
        'dashboard.title': 'Dashboard',
        'btn.quickScan': '⚡ Quick Scan',
        'health.deviceHealthy': 'Device Healthy',
        'label.lastScan': 'Last scan:',
        'metric.battery': 'Battery',
        'metric.storage': 'Storage',
        'metric.ram': 'RAM',
        'status.battery': 'Battery',
        'status.storage': 'Storage',
        'status.ram': 'RAM',
        'hw.page.title': 'Hardware Tests',
        'hw.modal.title': 'Hardware Test',
        'hw.modal.yes': '✅ Yes, it worked',
        'hw.modal.no': '❌ No, it failed',
        'hw.btn.start': 'Start Test',
        'hw.multitouch.title': 'Multi‑Touch',
        'hw.multitouch.desc': 'Test touch sensitivity and multiple points.',
        'hw.deadpixel.title': 'Dead Pixel',
        'hw.deadpixel.desc': 'Display full‑screen RGB/white patterns.',
        'hw.camera.title': 'Camera',
        'hw.camera.desc': 'Test camera preview and capture.',
        'hw.speaker.title': 'Speaker / Mic',
        'hw.speaker.desc': 'Record and play back audio.',
        'hw.wifi.title': 'WiFi / Bluetooth',
        'hw.wifi.desc': 'Scan for networks and devices.',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': 'Check satellite count and accuracy.',
        'action.storageAnalysis.title': 'Storage Analysis',
        'action.storageAnalysis.desc': 'Check storage usage & large files',
        'action.appSecurity.title': 'App Security Scan',
        'action.appSecurity.desc': 'Detect suspicious & risky apps',
        'action.install.title': 'Install Android App',
        'action.install.desc': 'Deploy companion app',
        'action.wizard.title': 'USB Debugging Wizard',
        'action.wizard.desc': 'Connect your phone',
        'action.help.title': 'Help',
        'action.help.desc': 'Guides & support',
        'safety.title': 'Software Safety',
        'safety.patch': 'Security Patch',
        'safety.root': 'Root Status',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': 'Unknown Sources',
        'safety.adb': 'USB Debugging',
        'safety.suspicious': 'Suspicious Apps',
        'conn.title': '🔌 Connection Troubleshoot',
        'conn.noDevice': 'No device connected.',
        'conn.wifi.title': 'WiFi',
        'conn.wifi.desc': 'Test WiFi connectivity',
        'conn.bluetooth.title': 'Bluetooth',
        'conn.bluetooth.desc': 'Test Bluetooth file transfer',
        'conn.mobile.title': 'Mobile Data',
        'conn.mobile.desc': 'Test mobile data connectivity',
        'conn.btn.test': 'Test',
        'conn.btn.rerun': 'Rerun',
        'conn.btn.retry': 'Retry',
        'conn.btn.running': '⏳ Running...',
        'conn.btn.applying': '⏳ Applying...',
        'conn.status.pending': '⏳ Pending',
        'conn.status.passed': '✅ Passed',
        'conn.status.failed': '❌ Failed',
        'conn.status.running': '⏳ Running...',
        'conn.status.error': '❌ Error',
        'conn.fixOptions.title': '🛠️ Fix Options',
        'conn.fixOptions.warning': '⚠️ All services seem healthy. Fixes may temporarily disrupt connectivity.',
        'conn.restoreNotice.restoring': 'ℹ️ Restoring the radio state you had before this test...',
        'conn.restoreNotice.restored': '✅ Original radio settings restored.',
        'conn.testing': '🔄 Testing {service}...',
        'conn.error.timeout': 'Device did not respond in time.',
        'conn.error.prefix': '❌ Error: ',
        'conn.fixFailed.prefix': 'Fix failed: ',
        'conn.fixConfirm': '⚠️ All services are currently working. Are you sure you want to apply the fix "{action}"? This may temporarily disrupt connectivity.',
        'conn.fixApplied.default': 'Fix applied',
        'conn.paired': 'Paired',
        'conn.opp': 'OPP',
        'conn.signal': 'Signal',
        'conn.fix.wifi.reset': '🔄 Reset WiFi',
        'conn.fix.wifi.scan': '📡 Scan',
        'conn.fix.bluetooth.reset': '🔄 Reset Bluetooth',
        'conn.fix.bluetooth.forceStop': '⏹️ Force Stop',
        'conn.fix.bluetooth.clearCache': '🧹 Clear Cache',
        'conn.fix.mobile.reset': '🔄 Reset Mobile Data',
        'conn.fix.mobile.lte': '📶 Force LTE',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': 'Bluetooth',
        'conn.service.mobile': 'Mobile',
    },
    es: {
        settingsTitle: '⚙️ Configuración',
        settingsSubtitle: 'Personaliza SmartHub según tus preferencias.',
        languageLabel: '🌐 Idioma',
        languageHint: 'Idioma de la interfaz (traducciones en progreso).',
        themeLabel: '🎨 Color del Tema',
        themeHint: 'Elige un color principal para botones y resaltados.',
        adbLabel: '📂 Ruta de ADB (opcional)',
        adbHint: 'Déjalo vacío para usar ADB del PATH del sistema.',
        refreshLabel: '⏱️ Actualización Automática (segundos)',
        refreshHint: 'Intervalo para actualizar la información del dispositivo.',
        saveBtn: '💾 Guardar Configuración',
        resetBtn: '↩️ Restablecer Valores',
        savedMsg: '✅ ¡Configuración guardada con éxito!',
        resetMsg: '✅ Configuración restablecida.',
        'app.title': 'SmartHub',
        'nav.dashboard': 'Panel',
        'nav.hardwareTests': 'Pruebas de Hardware',
        'nav.connectionTroubleshoot': 'Solución de Conexión',
        'nav.bsod': 'Diagnóstico BSOD',
        'nav.advanced': 'Avanzado',
        'nav.deviceInfo': 'Información del Dispositivo',
        'nav.repairs': 'Reparaciones',
        'nav.aiConclusion': 'Conclusión IA',
        'nav.settings': 'Configuración',
        'connection.disconnected': 'Desconectado',
        'connection.connected': 'Conectado',
        'loading.text': 'Cargando…',
        'dashboard.title': 'Panel',
        'btn.quickScan': '⚡ Análisis Rápido',
        'health.deviceHealthy': 'Dispositivo Saludable',
        'label.lastScan': 'Último análisis:',
        'metric.battery': 'Batería',
        'metric.storage': 'Almacenamiento',
        'metric.ram': 'RAM',
        'status.battery': 'Batería',
        'status.storage': 'Almacenamiento',
        'status.ram': 'RAM',
        'hw.page.title': 'Pruebas de Hardware',
        'hw.modal.title': 'Prueba de Hardware',
        'hw.modal.yes': '✅ Sí, funcionó',
        'hw.modal.no': '❌ No, falló',
        'hw.btn.start': 'Iniciar Prueba',
        'hw.multitouch.title': 'Multi‑Táctil',
        'hw.multitouch.desc': 'Prueba la sensibilidad táctil y varios puntos.',
        'hw.deadpixel.title': 'Píxel Muerto',
        'hw.deadpixel.desc': 'Muestra patrones RGB/blanco a pantalla completa.',
        'hw.camera.title': 'Cámara',
        'hw.camera.desc': 'Prueba la vista previa y captura de la cámara.',
        'hw.speaker.title': 'Altavoz / Micrófono',
        'hw.speaker.desc': 'Graba y reproduce audio.',
        'hw.wifi.title': 'WiFi / Bluetooth',
        'hw.wifi.desc': 'Busca redes y dispositivos.',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': 'Verifica la cantidad de satélites y la precisión.',
        'action.storageAnalysis.title': 'Análisis de Almacenamiento',
        'action.storageAnalysis.desc': 'Revisa el uso de almacenamiento y archivos grandes',
        'action.appSecurity.title': 'Escaneo de Seguridad de Apps',
        'action.appSecurity.desc': 'Detecta apps sospechosas y riesgosas',
        'action.install.title': 'Instalar App de Android',
        'action.install.desc': 'Implementar app complementaria',
        'action.wizard.title': 'Asistente de Depuración USB',
        'action.wizard.desc': 'Conecta tu teléfono',
        'action.help.title': 'Ayuda',
        'action.help.desc': 'Guías y soporte',
        'safety.title': 'Seguridad del Software',
        'safety.patch': 'Parche de Seguridad',
        'safety.root': 'Estado de Root',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': 'Orígenes Desconocidos',
        'safety.adb': 'Depuración USB',
        'safety.suspicious': 'Apps Sospechosas',
        'conn.title': '🔌 Solución de Conexión',
        'conn.noDevice': 'No hay ningún dispositivo conectado.',
        'conn.wifi.title': 'WiFi',
        'conn.wifi.desc': 'Prueba la conectividad WiFi',
        'conn.bluetooth.title': 'Bluetooth',
        'conn.bluetooth.desc': 'Prueba la transferencia de archivos por Bluetooth',
        'conn.mobile.title': 'Datos Móviles',
        'conn.mobile.desc': 'Prueba la conectividad de datos móviles',
        'conn.btn.test': 'Probar',
        'conn.btn.rerun': 'Repetir',
        'conn.btn.retry': 'Reintentar',
        'conn.btn.running': '⏳ Ejecutando...',
        'conn.btn.applying': '⏳ Aplicando...',
        'conn.status.pending': '⏳ Pendiente',
        'conn.status.passed': '✅ Aprobado',
        'conn.status.failed': '❌ Fallido',
        'conn.status.running': '⏳ Ejecutando...',
        'conn.status.error': '❌ Error',
        'conn.fixOptions.title': '🛠️ Opciones de Solución',
        'conn.fixOptions.warning': '⚠️ Todos los servicios parecen saludables. Las soluciones pueden interrumpir la conectividad temporalmente.',
        'conn.restoreNotice.restoring': 'ℹ️ Restaurando el estado de radio que tenías antes de esta prueba...',
        'conn.restoreNotice.restored': '✅ Configuración de radio original restaurada.',
        'conn.testing': '🔄 Probando {service}...',
        'conn.error.timeout': 'El dispositivo no respondió a tiempo.',
        'conn.error.prefix': '❌ Error: ',
        'conn.fixFailed.prefix': 'Falló la solución: ',
        'conn.fixConfirm': '⚠️ Todos los servicios están funcionando actualmente. ¿Seguro que quieres aplicar la solución "{action}"? Esto puede interrumpir la conectividad temporalmente.',
        'conn.fixApplied.default': 'Solución aplicada',
        'conn.paired': 'Emparejados',
        'conn.opp': 'OPP',
        'conn.signal': 'Señal',
        'conn.fix.wifi.reset': '🔄 Reiniciar WiFi',
        'conn.fix.wifi.scan': '📡 Buscar',
        'conn.fix.bluetooth.reset': '🔄 Reiniciar Bluetooth',
        'conn.fix.bluetooth.forceStop': '⏹️ Forzar Detención',
        'conn.fix.bluetooth.clearCache': '🧹 Borrar Caché',
        'conn.fix.mobile.reset': '🔄 Reiniciar Datos Móviles',
        'conn.fix.mobile.lte': '📶 Forzar LTE',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': 'Bluetooth',
        'conn.service.mobile': 'Móvil',
    },
    fr: {
        settingsTitle: '⚙️ Paramètres',
        settingsSubtitle: 'Personnalisez SmartHub selon vos préférences.',
        languageLabel: '🌐 Langue',
        languageHint: 'Langue de l\'interface (traductions en cours).',
        themeLabel: '🎨 Couleur du Thème',
        themeHint: 'Choisissez une couleur principale pour les boutons.',
        adbLabel: '📂 Chemin ADB (optionnel)',
        adbHint: 'Laissez vide pour utiliser l\'ADB du PATH système.',
        refreshLabel: '⏱️ Actualisation Auto (secondes)',
        refreshHint: 'Intervalle de mise à jour des infos de l\'appareil.',
        saveBtn: '💾 Enregistrer',
        resetBtn: '↩️ Réinitialiser',
        savedMsg: '✅ Paramètres enregistrés avec succès !',
        resetMsg: '✅ Paramètres réinitialisés.',
        'app.title': 'SmartHub',
        'nav.dashboard': 'Tableau de Bord',
        'nav.hardwareTests': 'Tests Matériel',
        'nav.connectionTroubleshoot': 'Dépannage Connexion',
        'nav.bsod': 'Diagnostic BSOD',
        'nav.advanced': 'Avancé',
        'nav.deviceInfo': 'Infos Appareil',
        'nav.repairs': 'Réparations',
        'nav.aiConclusion': 'Conclusion IA',
        'nav.settings': 'Paramètres',
        'connection.disconnected': 'Déconnecté',
        'connection.connected': 'Connecté',
        'loading.text': 'Chargement…',
        'dashboard.title': 'Tableau de Bord',
        'btn.quickScan': '⚡ Scan Rapide',
        'health.deviceHealthy': 'Appareil en Bon État',
        'label.lastScan': 'Dernier scan :',
        'metric.battery': 'Batterie',
        'metric.storage': 'Stockage',
        'metric.ram': 'RAM',
        'status.battery': 'Batterie',
        'status.storage': 'Stockage',
        'status.ram': 'RAM',
        'hw.page.title': 'Tests Matériel',
        'hw.modal.title': 'Test Matériel',
        'hw.modal.yes': '✅ Oui, ça a fonctionné',
        'hw.modal.no': '❌ Non, ça a échoué',
        'hw.btn.start': 'Démarrer le Test',
        'hw.multitouch.title': 'Multi‑Touch',
        'hw.multitouch.desc': 'Teste la sensibilité tactile et les points multiples.',
        'hw.deadpixel.title': 'Pixel Mort',
        'hw.deadpixel.desc': 'Affiche des motifs RGB/blanc en plein écran.',
        'hw.camera.title': 'Caméra',
        'hw.camera.desc': 'Teste l\'aperçu et la capture de la caméra.',
        'hw.speaker.title': 'Haut‑parleur / Micro',
        'hw.speaker.desc': 'Enregistre et relit l\'audio.',
        'hw.wifi.title': 'WiFi / Bluetooth',
        'hw.wifi.desc': 'Recherche des réseaux et appareils.',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': 'Vérifie le nombre de satellites et la précision.',
        'action.storageAnalysis.title': 'Analyse du Stockage',
        'action.storageAnalysis.desc': 'Vérifie l\'utilisation du stockage et les gros fichiers',
        'action.appSecurity.title': 'Analyse de Sécurité des Apps',
        'action.appSecurity.desc': 'Détecte les applications suspectes et risquées',
        'action.install.title': 'Installer une App Android',
        'action.install.desc': 'Déployer l\'application compagnon',
        'action.wizard.title': 'Assistant Débogage USB',
        'action.wizard.desc': 'Connecte ton téléphone',
        'action.help.title': 'Aide',
        'action.help.desc': 'Guides et support',
        'safety.title': 'Sécurité du Logiciel',
        'safety.patch': 'Correctif de Sécurité',
        'safety.root': 'Statut Root',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': 'Sources Inconnues',
        'safety.adb': 'Débogage USB',
        'safety.suspicious': 'Apps Suspectes',
        'conn.title': '🔌 Dépannage Connexion',
        'conn.noDevice': 'Aucun appareil connecté.',
        'conn.wifi.title': 'WiFi',
        'conn.wifi.desc': 'Teste la connectivité WiFi',
        'conn.bluetooth.title': 'Bluetooth',
        'conn.bluetooth.desc': 'Teste le transfert de fichiers Bluetooth',
        'conn.mobile.title': 'Données Mobiles',
        'conn.mobile.desc': 'Teste la connectivité des données mobiles',
        'conn.btn.test': 'Tester',
        'conn.btn.rerun': 'Relancer',
        'conn.btn.retry': 'Réessayer',
        'conn.btn.running': '⏳ En cours...',
        'conn.btn.applying': '⏳ Application...',
        'conn.status.pending': '⏳ En attente',
        'conn.status.passed': '✅ Réussi',
        'conn.status.failed': '❌ Échoué',
        'conn.status.running': '⏳ En cours...',
        'conn.status.error': '❌ Erreur',
        'conn.fixOptions.title': '🛠️ Options de Réparation',
        'conn.fixOptions.warning': '⚠️ Tous les services semblent sains. Les réparations peuvent perturber temporairement la connectivité.',
        'conn.restoreNotice.restoring': 'ℹ️ Restauration de l\'état radio d\'avant ce test...',
        'conn.restoreNotice.restored': '✅ Paramètres radio d\'origine restaurés.',
        'conn.testing': '🔄 Test de {service} en cours...',
        'conn.error.timeout': 'L\'appareil n\'a pas répondu à temps.',
        'conn.error.prefix': '❌ Erreur : ',
        'conn.fixFailed.prefix': 'Échec de la réparation : ',
        'conn.fixConfirm': '⚠️ Tous les services fonctionnent actuellement. Voulez-vous vraiment appliquer la réparation "{action}" ? Cela peut perturber temporairement la connectivité.',
        'conn.fixApplied.default': 'Réparation appliquée',
        'conn.paired': 'Appairés',
        'conn.opp': 'OPP',
        'conn.signal': 'Signal',
        'conn.fix.wifi.reset': '🔄 Réinitialiser le WiFi',
        'conn.fix.wifi.scan': '📡 Rechercher',
        'conn.fix.bluetooth.reset': '🔄 Réinitialiser le Bluetooth',
        'conn.fix.bluetooth.forceStop': '⏹️ Forcer l\'Arrêt',
        'conn.fix.bluetooth.clearCache': '🧹 Vider le Cache',
        'conn.fix.mobile.reset': '🔄 Réinitialiser les Données Mobiles',
        'conn.fix.mobile.lte': '📶 Forcer LTE',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': 'Bluetooth',
        'conn.service.mobile': 'Mobile',
    },
    de: {
        settingsTitle: '⚙️ Einstellungen',
        settingsSubtitle: 'Passe SmartHub an deine Vorlieben an.',
        languageLabel: '🌐 Sprache',
        languageHint: 'UI-Sprache (Übersetzungen in Arbeit).',
        themeLabel: '🎨 Themenfarbe',
        themeHint: 'Wähle eine Hauptfarbe für Buttons und Akzente.',
        adbLabel: '📂 ADB-Pfad (optional)',
        adbHint: 'Leer lassen, um ADB aus dem System-PATH zu nutzen.',
        refreshLabel: '⏱️ Auto-Aktualisierung (Sekunden)',
        refreshHint: 'Intervall für automatische Geräteinfo-Updates.',
        saveBtn: '💾 Speichern',
        resetBtn: '↩️ Zurücksetzen',
        savedMsg: '✅ Einstellungen erfolgreich gespeichert!',
        resetMsg: '✅ Einstellungen zurückgesetzt.',
        'app.title': 'SmartHub',
        'nav.dashboard': 'Übersicht',
        'nav.hardwareTests': 'Hardware-Tests',
        'nav.connectionTroubleshoot': 'Verbindungsfehler beheben',
        'nav.bsod': 'BSOD-Diagnose',
        'nav.advanced': 'Erweitert',
        'nav.deviceInfo': 'Geräteinfo',
        'nav.repairs': 'Reparaturen',
        'nav.aiConclusion': 'KI-Fazit',
        'nav.settings': 'Einstellungen',
        'connection.disconnected': 'Getrennt',
        'connection.connected': 'Verbunden',
        'loading.text': 'Wird geladen…',
        'dashboard.title': 'Übersicht',
        'btn.quickScan': '⚡ Schnellscan',
        'health.deviceHealthy': 'Gerät ist gesund',
        'label.lastScan': 'Letzter Scan:',
        'metric.battery': 'Akku',
        'metric.storage': 'Speicher',
        'metric.ram': 'RAM',
        'status.battery': 'Akku',
        'status.storage': 'Speicher',
        'status.ram': 'RAM',
        'hw.page.title': 'Hardware-Tests',
        'hw.modal.title': 'Hardware-Test',
        'hw.modal.yes': '✅ Ja, hat funktioniert',
        'hw.modal.no': '❌ Nein, fehlgeschlagen',
        'hw.btn.start': 'Test starten',
        'hw.multitouch.title': 'Multi-Touch',
        'hw.multitouch.desc': 'Testet Touch-Empfindlichkeit und mehrere Punkte.',
        'hw.deadpixel.title': 'Pixelfehler',
        'hw.deadpixel.desc': 'Zeigt Vollbild-RGB-/Weißmuster an.',
        'hw.camera.title': 'Kamera',
        'hw.camera.desc': 'Testet Kameravorschau und Aufnahme.',
        'hw.speaker.title': 'Lautsprecher / Mikro',
        'hw.speaker.desc': 'Nimmt Audio auf und spielt es ab.',
        'hw.wifi.title': 'WLAN / Bluetooth',
        'hw.wifi.desc': 'Sucht nach Netzwerken und Geräten.',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': 'Prüft Satellitenanzahl und Genauigkeit.',
        'action.storageAnalysis.title': 'Speicheranalyse',
        'action.storageAnalysis.desc': 'Speichernutzung & große Dateien prüfen',
        'action.appSecurity.title': 'App-Sicherheitsscan',
        'action.appSecurity.desc': 'Erkennt verdächtige & riskante Apps',
        'action.install.title': 'Android-App Installieren',
        'action.install.desc': 'Begleit-App bereitstellen',
        'action.wizard.title': 'USB-Debugging-Assistent',
        'action.wizard.desc': 'Verbinde dein Telefon',
        'action.help.title': 'Hilfe',
        'action.help.desc': 'Anleitungen & Support',
        'safety.title': 'Software-Sicherheit',
        'safety.patch': 'Sicherheitspatch',
        'safety.root': 'Root-Status',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': 'Unbekannte Quellen',
        'safety.adb': 'USB-Debugging',
        'safety.suspicious': 'Verdächtige Apps',
        'conn.title': '🔌 Verbindungsfehler beheben',
        'conn.noDevice': 'Kein Gerät verbunden.',
        'conn.wifi.title': 'WLAN',
        'conn.wifi.desc': 'Testet die WLAN-Verbindung',
        'conn.bluetooth.title': 'Bluetooth',
        'conn.bluetooth.desc': 'Testet die Bluetooth-Dateiübertragung',
        'conn.mobile.title': 'Mobile Daten',
        'conn.mobile.desc': 'Testet die mobile Datenverbindung',
        'conn.btn.test': 'Testen',
        'conn.btn.rerun': 'Erneut ausführen',
        'conn.btn.retry': 'Wiederholen',
        'conn.btn.running': '⏳ Läuft...',
        'conn.btn.applying': '⏳ Wird angewendet...',
        'conn.status.pending': '⏳ Ausstehend',
        'conn.status.passed': '✅ Bestanden',
        'conn.status.failed': '❌ Fehlgeschlagen',
        'conn.status.running': '⏳ Läuft...',
        'conn.status.error': '❌ Fehler',
        'conn.fixOptions.title': '🛠️ Reparaturoptionen',
        'conn.fixOptions.warning': '⚠️ Alle Dienste scheinen in Ordnung zu sein. Reparaturen können die Verbindung vorübergehend stören.',
        'conn.restoreNotice.restoring': 'ℹ️ Der Funkstatus von vor diesem Test wird wiederhergestellt...',
        'conn.restoreNotice.restored': '✅ Ursprüngliche Funkeinstellungen wiederhergestellt.',
        'conn.testing': '🔄 Teste {service}...',
        'conn.error.timeout': 'Das Gerät hat nicht rechtzeitig geantwortet.',
        'conn.error.prefix': '❌ Fehler: ',
        'conn.fixFailed.prefix': 'Reparatur fehlgeschlagen: ',
        'conn.fixConfirm': '⚠️ Alle Dienste funktionieren derzeit. Möchtest du die Reparatur "{action}" wirklich anwenden? Dies kann die Verbindung vorübergehend stören.',
        'conn.fixApplied.default': 'Reparatur angewendet',
        'conn.paired': 'Gekoppelt',
        'conn.opp': 'OPP',
        'conn.signal': 'Signal',
        'conn.fix.wifi.reset': '🔄 WLAN zurücksetzen',
        'conn.fix.wifi.scan': '📡 Suchen',
        'conn.fix.bluetooth.reset': '🔄 Bluetooth zurücksetzen',
        'conn.fix.bluetooth.forceStop': '⏹️ Erzwungen beenden',
        'conn.fix.bluetooth.clearCache': '🧹 Cache leeren',
        'conn.fix.mobile.reset': '🔄 Mobile Daten zurücksetzen',
        'conn.fix.mobile.lte': '📶 LTE erzwingen',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': 'Bluetooth',
        'conn.service.mobile': 'Mobil',
    },
    zh: {
        settingsTitle: '⚙️ 设置',
        settingsSubtitle: '根据您的喜好自定义 SmartHub。',
        languageLabel: '🌐 语言',
        languageHint: '界面语言（翻译正在进行中）。',
        themeLabel: '🎨 主题颜色',
        themeHint: '为按钮和高亮选择主色调。',
        adbLabel: '📂 ADB 路径（可选）',
        adbHint: '留空则使用系统 PATH 中的 ADB。',
        refreshLabel: '⏱️ 自动刷新（秒）',
        refreshHint: '自动更新设备信息的间隔。',
        saveBtn: '💾 保存设置',
        resetBtn: '↩️ 恢复默认',
        savedMsg: '✅ 设置已成功保存！',
        resetMsg: '✅ 设置已恢复默认。',
        'app.title': 'SmartHub',
        'nav.dashboard': '仪表盘',
        'nav.hardwareTests': '硬件测试',
        'nav.connectionTroubleshoot': '连接故障排除',
        'nav.bsod': '蓝屏诊断',
        'nav.advanced': '高级',
        'nav.deviceInfo': '设备信息',
        'nav.repairs': '维修',
        'nav.aiConclusion': 'AI 结论',
        'nav.settings': '设置',
        'connection.disconnected': '未连接',
        'connection.connected': '已连接',
        'loading.text': '加载中…',
        'dashboard.title': '仪表盘',
        'btn.quickScan': '⚡ 快速扫描',
        'health.deviceHealthy': '设备状态良好',
        'label.lastScan': '上次扫描：',
        'metric.battery': '电池',
        'metric.storage': '存储',
        'metric.ram': '内存',
        'status.battery': '电池',
        'status.storage': '存储',
        'status.ram': '内存',
        'hw.page.title': '硬件测试',
        'hw.modal.title': '硬件测试',
        'hw.modal.yes': '✅ 是，正常',
        'hw.modal.no': '❌ 否，失败',
        'hw.btn.start': '开始测试',
        'hw.multitouch.title': '多点触控',
        'hw.multitouch.desc': '测试触摸灵敏度和多点触控。',
        'hw.deadpixel.title': '坏点检测',
        'hw.deadpixel.desc': '全屏显示 RGB/白色图案。',
        'hw.camera.title': '摄像头',
        'hw.camera.desc': '测试摄像头预览和拍摄。',
        'hw.speaker.title': '扬声器 / 麦克风',
        'hw.speaker.desc': '录制并播放音频。',
        'hw.wifi.title': 'WiFi / 蓝牙',
        'hw.wifi.desc': '扫描网络和设备。',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': '检查卫星数量和精度。',
        'action.storageAnalysis.title': '存储分析',
        'action.storageAnalysis.desc': '检查存储使用情况和大文件',
        'action.appSecurity.title': '应用安全扫描',
        'action.appSecurity.desc': '检测可疑和高风险应用',
        'action.install.title': '安装安卓应用',
        'action.install.desc': '部署配套应用',
        'action.wizard.title': 'USB 调试向导',
        'action.wizard.desc': '连接您的手机',
        'action.help.title': '帮助',
        'action.help.desc': '指南与支持',
        'safety.title': '软件安全',
        'safety.patch': '安全补丁',
        'safety.root': 'Root 状态',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': '未知来源',
        'safety.adb': 'USB 调试',
        'safety.suspicious': '可疑应用',
        'conn.title': '🔌 连接故障排除',
        'conn.noDevice': '没有已连接的设备。',
        'conn.wifi.title': 'WiFi',
        'conn.wifi.desc': '测试 WiFi 连接',
        'conn.bluetooth.title': '蓝牙',
        'conn.bluetooth.desc': '测试蓝牙文件传输',
        'conn.mobile.title': '移动数据',
        'conn.mobile.desc': '测试移动数据连接',
        'conn.btn.test': '测试',
        'conn.btn.rerun': '重新运行',
        'conn.btn.retry': '重试',
        'conn.btn.running': '⏳ 运行中...',
        'conn.btn.applying': '⏳ 应用中...',
        'conn.status.pending': '⏳ 待处理',
        'conn.status.passed': '✅ 通过',
        'conn.status.failed': '❌ 失败',
        'conn.status.running': '⏳ 运行中...',
        'conn.status.error': '❌ 错误',
        'conn.fixOptions.title': '🛠️ 修复选项',
        'conn.fixOptions.warning': '⚠️ 所有服务看起来正常。修复可能会暂时中断连接。',
        'conn.restoreNotice.restoring': 'ℹ️ 正在恢复此测试前的无线电状态...',
        'conn.restoreNotice.restored': '✅ 已恢复原始无线电设置。',
        'conn.testing': '🔄 正在测试 {service}...',
        'conn.error.timeout': '设备未及时响应。',
        'conn.error.prefix': '❌ 错误：',
        'conn.fixFailed.prefix': '修复失败：',
        'conn.fixConfirm': '⚠️ 所有服务目前均正常工作。确定要应用修复"{action}"吗？这可能会暂时中断连接。',
        'conn.fixApplied.default': '修复已应用',
        'conn.paired': '已配对',
        'conn.opp': 'OPP',
        'conn.signal': '信号',
        'conn.fix.wifi.reset': '🔄 重置 WiFi',
        'conn.fix.wifi.scan': '📡 扫描',
        'conn.fix.bluetooth.reset': '🔄 重置蓝牙',
        'conn.fix.bluetooth.forceStop': '⏹️ 强制停止',
        'conn.fix.bluetooth.clearCache': '🧹 清除缓存',
        'conn.fix.mobile.reset': '🔄 重置移动数据',
        'conn.fix.mobile.lte': '📶 强制 LTE',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': '蓝牙',
        'conn.service.mobile': '移动数据',
    },
    fil: {
        settingsTitle: '⚙️ Mga Setting',
        settingsSubtitle: 'I-customize ang SmartHub ayon sa gusto mo.',
        languageLabel: '🌐 Wika',
        languageHint: 'Wika ng UI (patuloy pang isinasalin).',
        themeLabel: '🎨 Kulay ng Tema',
        themeHint: 'Pumili ng pangunahing kulay para sa mga button at highlight.',
        adbLabel: '📂 ADB Path (opsyonal)',
        adbHint: 'Iwanang blangko para gamitin ang ADB mula sa system PATH.',
        refreshLabel: '⏱️ Auto‑Refresh (segundo)',
        refreshHint: 'Agwat ng oras para sa awtomatikong pag-update ng device info.',
        saveBtn: '💾 I-save ang mga Setting',
        resetBtn: '↩️ Ibalik sa Default',
        savedMsg: '✅ Matagumpay na na-save ang mga setting!',
        resetMsg: '✅ Naibalik sa default ang mga setting.',
        'app.title': 'SmartHub',
        'nav.dashboard': 'Dashboard',
        'nav.hardwareTests': 'Pagsusuri ng Hardware',
        'nav.connectionTroubleshoot': 'Ayusin ang Koneksyon',
        'nav.bsod': 'BSOD Diagnosis',
        'nav.advanced': 'Advanced',
        'nav.deviceInfo': 'Impormasyon ng Device',
        'nav.repairs': 'Mga Pagkukumpuni',
        'nav.aiConclusion': 'Konklusyon ng AI',
        'nav.settings': 'Mga Setting',
        'connection.disconnected': 'Naka-disconnect',
        'connection.connected': 'Nakakonekta',
        'loading.text': 'Naglo-load…',
        'dashboard.title': 'Dashboard',
        'btn.quickScan': '⚡ Mabilisang Scan',
        'health.deviceHealthy': 'Maayos ang Device',
        'label.lastScan': 'Huling scan:',
        'metric.battery': 'Baterya',
        'metric.storage': 'Storage',
        'metric.ram': 'RAM',
        'status.battery': 'Baterya',
        'status.storage': 'Storage',
        'status.ram': 'RAM',
        'hw.page.title': 'Pagsusuri ng Hardware',
        'hw.modal.title': 'Pagsusuri ng Hardware',
        'hw.modal.yes': '✅ Oo, gumana',
        'hw.modal.no': '❌ Hindi, nabigo',
        'hw.btn.start': 'Simulan ang Test',
        'hw.multitouch.title': 'Multi‑Touch',
        'hw.multitouch.desc': 'Subukan ang sensitivity ng touch at maraming punto.',
        'hw.deadpixel.title': 'Dead Pixel',
        'hw.deadpixel.desc': 'Ipakita ang full‑screen na RGB/puting pattern.',
        'hw.camera.title': 'Camera',
        'hw.camera.desc': 'Subukan ang camera preview at pagkuha.',
        'hw.speaker.title': 'Speaker / Mic',
        'hw.speaker.desc': 'Mag-record at i-play back ang audio.',
        'hw.wifi.title': 'WiFi / Bluetooth',
        'hw.wifi.desc': 'Mag-scan ng mga network at device.',
        'hw.gps.title': 'GPS',
        'hw.gps.desc': 'Suriin ang bilang ng satellite at accuracy.',
        'action.storageAnalysis.title': 'Pagsusuri ng Storage',
        'action.storageAnalysis.desc': 'Suriin ang paggamit ng storage & malalaking file',
        'action.appSecurity.title': 'App Security Scan',
        'action.appSecurity.desc': 'Tuklasin ang mga kahina-hinala at mapanganib na app',
        'action.install.title': 'I-install ang Android App',
        'action.install.desc': 'I-deploy ang companion app',
        'action.wizard.title': 'USB Debugging Wizard',
        'action.wizard.desc': 'Ikonekta ang iyong telepono',
        'action.help.title': 'Tulong',
        'action.help.desc': 'Mga gabay at suporta',
        'safety.title': 'Kaligtasan ng Software',
        'safety.patch': 'Security Patch',
        'safety.root': 'Root Status',
        'safety.playProtect': 'Play Protect',
        'safety.unknown': 'Unknown Sources',
        'safety.adb': 'USB Debugging',
        'safety.suspicious': 'Kahina-hinalang Apps',
        'conn.title': '🔌 Ayusin ang Koneksyon',
        'conn.noDevice': 'Walang nakakonektang device.',
        'conn.wifi.title': 'WiFi',
        'conn.wifi.desc': 'Subukan ang koneksyon sa WiFi',
        'conn.bluetooth.title': 'Bluetooth',
        'conn.bluetooth.desc': 'Subukan ang paglilipat ng file sa Bluetooth',
        'conn.mobile.title': 'Mobile Data',
        'conn.mobile.desc': 'Subukan ang koneksyon sa mobile data',
        'conn.btn.test': 'Test',
        'conn.btn.rerun': 'Ulitin',
        'conn.btn.retry': 'Subukan Ulit',
        'conn.btn.running': '⏳ Tumatakbo...',
        'conn.btn.applying': '⏳ Inaaplay...',
        'conn.status.pending': '⏳ Nakabinbin',
        'conn.status.passed': '✅ Pumasa',
        'conn.status.failed': '❌ Nabigo',
        'conn.status.running': '⏳ Tumatakbo...',
        'conn.status.error': '❌ Error',
        'conn.fixOptions.title': '🛠️ Mga Opsyon sa Ayos',
        'conn.fixOptions.warning': '⚠️ Mukhang maayos ang lahat ng serbisyo. Ang mga ayos ay maaaring pansamantalang makaabala sa koneksyon.',
        'conn.restoreNotice.restoring': 'ℹ️ Ibinabalik ang radio state bago ang test na ito...',
        'conn.restoreNotice.restored': '✅ Naibalik ang orihinal na radio settings.',
        'conn.testing': '🔄 Sinusubukan ang {service}...',
        'conn.error.timeout': 'Hindi tumugon ang device sa oras.',
        'conn.error.prefix': '❌ Error: ',
        'conn.fixFailed.prefix': 'Nabigo ang ayos: ',
        'conn.fixConfirm': '⚠️ Gumagana nang maayos ang lahat ng serbisyo sa ngayon. Sigurado ka bang gusto mong i-apply ang ayos na "{action}"? Maaari nitong pansamantalang maabala ang koneksyon.',
        'conn.fixApplied.default': 'Na-apply ang ayos',
        'conn.paired': 'Naka-pair',
        'conn.opp': 'OPP',
        'conn.signal': 'Signal',
        'conn.fix.wifi.reset': '🔄 I-reset ang WiFi',
        'conn.fix.wifi.scan': '📡 Mag-scan',
        'conn.fix.bluetooth.reset': '🔄 I-reset ang Bluetooth',
        'conn.fix.bluetooth.forceStop': '⏹️ Force Stop',
        'conn.fix.bluetooth.clearCache': '🧹 I-clear ang Cache',
        'conn.fix.mobile.reset': '🔄 I-reset ang Mobile Data',
        'conn.fix.mobile.lte': '📶 Force LTE',
        'conn.service.wifi': 'Wifi',
        'conn.service.bluetooth': 'Bluetooth',
        'conn.service.mobile': 'Mobile',
    },
};

// ---- Translation helper (used inside templates — always returns a string) ----
function t(key, lang) {
    lang = lang || window._activeLang || 'en';
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

// ---- Safe translation lookup for DOM sweeps — returns null if missing so
//      we NEVER overwrite existing text with a raw key like "nav.dashboard" ----
function tSafe(key, lang) {
    if (I18N[lang] && I18N[lang][key] !== undefined) return I18N[lang][key];
    if (I18N.en && I18N.en[key] !== undefined) return I18N.en[key];
    return null;
}

// ---- APPLY LANGUAGE ACROSS THE WHOLE APP ----
// Sweeps the entire document. Any key without a translation is left
// untouched instead of showing a raw key.
function applyLanguage(lang) {
    window._activeLang = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = tSafe(key, lang);
        if (translated !== null) el.textContent = translated;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = tSafe(key, lang);
        if (translated !== null) el.setAttribute('placeholder', translated);
    });
}

// ---- Debounce helper (prevents flicker on fast input) ----
function debounce(fn, delay = 300) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- Render Settings Page ----
function renderSettings() {
    const container = document.getElementById('pageContent');

    const settings = JSON.parse(localStorage.getItem('smartHubSettings') || '{"language":"en","themeColor":"#0d6efd"}');
    const lang = settings.language || 'en';

    const languageOptions = [
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Español' },
        { code: 'fr', label: 'Français' },
        { code: 'de', label: 'Deutsch' },
        { code: 'zh', label: '中文' },
        { code: 'fil', label: 'Filipino' },
    ];

    const themeColors = [
        '#0d6efd', // blue
        '#6f42c1', // purple
        '#dc3545', // red
        '#28a745', // green
        '#fd7e14', // orange
        '#20c997', // teal
        '#e83e8c', // pink
        '#6610f2', // indigo
    ];

    const currentLangLabel = (languageOptions.find(o => o.code === lang) || languageOptions[0]).label;

    const html = `
        <div style="margin-bottom:24px;">
            <h1 data-i18n="settingsTitle" style="margin-bottom:6px; font-size:24px; font-weight:700; color:#1f2937;">${t('settingsTitle', lang)}</h1>
            <p data-i18n="settingsSubtitle" style="color:#6b7280; font-size:14px; margin:0;">${t('settingsSubtitle', lang)}</p>
        </div>

        <div class="card" style="padding:24px;">

            <!-- Language (custom dropdown — no native <select> popup, avoids
                 the Electron/Chromium invisible-overlay freeze bug entirely) -->
            <div style="margin-bottom:24px;">
                <label data-i18n="languageLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('languageLabel', lang)}</label>

                <div id="langDropdownWrap" style="position:relative; width:100%; max-width:280px;">
                    <button type="button" id="langDropdownBtn" data-value="${lang}" style="
                        width:100%; text-align:left; padding:8px 12px; border-radius:8px;
                        border:1px solid #e5e7eb; background:white; font-size:14px; cursor:pointer;
                        display:flex; justify-content:space-between; align-items:center;
                    ">
                        <span id="langDropdownLabel">${currentLangLabel}</span>
                        <span style="color:#9ca3af;">▾</span>
                    </button>

                    <div id="langDropdownList" style="
                        display:none; position:absolute; top:calc(100% + 4px); left:0; right:0;
                        background:white; border:1px solid #e5e7eb; border-radius:8px;
                        box-shadow:0 4px 12px rgba(0,0,0,0.08); z-index:50; max-height:220px; overflow-y:auto;
                    ">
                        ${languageOptions.map(opt => `
                            <div class="lang-option" data-value="${opt.code}" style="
                                padding:8px 12px; font-size:14px; cursor:pointer;
                                background:${opt.code === lang ? '#f3f4f6' : 'white'};
                            ">${opt.label}</div>
                        `).join('')}
                    </div>
                </div>

                <p data-i18n="languageHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('languageHint', lang)}</p>
            </div>

            <!-- Theme Color -->
            <div style="margin-bottom:24px;">
                <label data-i18n="themeLabel" style="font-weight:600; font-size:15px; display:block; margin-bottom:6px;">${t('themeLabel', lang)}</label>
                <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                    ${themeColors.map(color => `
                        <button class="theme-color-btn" data-color="${color}" style="
                            width:36px; height:36px; border-radius:50%; border:3px solid ${settings.themeColor === color ? '#1f2937' : 'transparent'};
                            background:${color}; cursor:pointer; transition: transform 0.15s;
                        " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></button>
                    `).join('')}
                    <input type="color" id="customThemeColor" value="${settings.themeColor}" style="width:40px; height:40px; border:none; padding:0; cursor:pointer; background:none;">
                </div>
                <p data-i18n="themeHint" style="font-size:12px; color:#9ca3af; margin-top:4px;">${t('themeHint', lang)}</p>
            </div>

            <!-- Reset to defaults -->
            <div style="border-top:1px solid #e5e7eb; padding-top:20px; display:flex; gap:12px; flex-wrap:wrap;">
                <button id="saveSettingsBtn" data-i18n="saveBtn" class="btn-primary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:none; background:#0d6efd; color:white; cursor:pointer; font-weight:600;">${t('saveBtn', lang)}</button>
                <button id="resetSettingsBtn" data-i18n="resetBtn" class="btn-secondary" style="padding:10px 28px; font-size:14px; border-radius:10px; border:1px solid #e5e7eb; background:white; color:#374151; cursor:pointer;">${t('resetBtn', lang)}</button>
            </div>

            <!-- Feedback -->
            <div id="settingsFeedback" style="margin-top:16px; font-size:14px;"></div>
        </div>
    `;

    container.innerHTML = html;

    // ---- Apply saved theme + language (now app-wide) ----
    applyThemeColor(settings.themeColor);
    applyLanguage(lang);

    // ---- Theme color presets ----
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const color = this.dataset.color;
            document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
            this.style.borderColor = '#1f2937';
            document.getElementById('customThemeColor').value = color;
            applyThemeColor(color);
        });
    });

    // ---- DEBOUNCED color picker (fixes freeze) ----
    let lastColor = settings.themeColor;
    document.getElementById('customThemeColor').addEventListener('input', debounce(function() {
        const color = this.value;
        if (color === lastColor) return;
        lastColor = color;
        document.querySelectorAll('.theme-color-btn').forEach(b => b.style.borderColor = 'transparent');
        applyThemeColor(color);
    }, 200));

    // ---- Custom language dropdown (replaces native <select>) ----
    const langBtn = document.getElementById('langDropdownBtn');
    const langList = document.getElementById('langDropdownList');
    const langLabel = document.getElementById('langDropdownLabel');

    function closeLangDropdown() {
        langList.style.display = 'none';
    }

    langBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = langList.style.display === 'block';
        langList.style.display = isOpen ? 'none' : 'block';
    });

    langList.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', function(e) {
            e.stopPropagation();
            const value = this.dataset.value;

            langBtn.dataset.value = value;
            langLabel.textContent = this.textContent;

            langList.querySelectorAll('.lang-option').forEach(o => o.style.background = 'white');
            this.style.background = '#f3f4f6';

            closeLangDropdown();
            // Applies to sidebar, header, dashboard, hardware tests, connection
            // troubleshoot, etc. — not just the settings page — since
            // applyLanguage is app-wide now.
            applyLanguage(value);
        });
    });

    // Close dropdown when clicking anywhere outside it
    document.addEventListener('click', function outsideClickHandler(e) {
        if (!langBtn.contains(e.target) && !langList.contains(e.target)) {
            closeLangDropdown();
        }
    });

    // ---- Save ----
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
        const language = langBtn.dataset.value;
        const themeColor = document.getElementById('customThemeColor').value;

        const newSettings = { language, themeColor };
        localStorage.setItem('smartHubSettings', JSON.stringify(newSettings));
        applyThemeColor(themeColor);
        applyLanguage(language);

        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('savedMsg', language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });

    // ---- Reset ----
    document.getElementById('resetSettingsBtn').addEventListener('click', function() {
        const defaults = { language: 'en', themeColor: '#0d6efd' };
        localStorage.setItem('smartHubSettings', JSON.stringify(defaults));
        renderSettings();
        applyThemeColor(defaults.themeColor);
        applyLanguage(defaults.language);
        const feedback = document.getElementById('settingsFeedback');
        feedback.innerHTML = `<span style="color:#16a34a;">${t('resetMsg', defaults.language)}</span>`;
        setTimeout(() => feedback.innerHTML = '', 3000);
    });
}