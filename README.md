# 🏠 Wall Panel Domótica IoT — Familia Varela Páez (V4.7)

Panel de control domótico inteligente multi-estilo (**Mi Hogar**) con integración en tiempo real para **Tuya Smart**, **Samsung SmartThings (Puente 24/7)**, **Sismógrafo ESP32 (Cloud MQTT + WebSockets)**, **Plano 3D Interactivo**, **Seguridad Armada con PIN Cifrado**, **Visión IA Local con Reconocimiento Facial (Cooldown 3h)**, **Asistente IA con Documentos del Hogar (RAG)** y **Notificaciones de Voz para Amazon Alexa**.

---

## ✨ Características Principales

- 🎨 **8 Estilos Visuales (Skins)**: *Glassmorphism, Neumorphism / Soft UI, Liquid Glass, Dark Luxury Gold, Bento Grid UI, Skeuomorphism, Aurora Boreal UI y Futuristic HUD*.
- 📐 **Bento Grill 2D (Ancho `1x..4x` × Alto `1x..3x`) + Paginación Touch/Swipe**:
  - Contenedor central amplio con tarjetas configurables tanto en **ancho (`1x`, `2x`, `3x`, `4x`)** como en **alto (`1x`, `2x`, `3x`)** sin deformación.
  - Desplazamiento táctil (swipe con los dedos o mouse) entre páginas cuando hay muchas tarjetas.
  - **Banner Fijo Inferior** de izquierda a derecha para tarjetas permanentes (*Iluminación, Clima Hogar, Armar Seguridad, Lavadora, Reglas*).
- 🌦️ **Widgets Protagonistas con Animaciones SVG Multicapa**:
  - Clima en vivo con animaciones de **Tormenta Eléctrica con Relámpagos**, **Lluvia Dinámica**, **Sol Radiante** y **Fases Reales de la Luna** con cráteres y estrellas.
- 💾 **Memoria Persistente Multi-Dispositivo (`wallpanel_state.json`)**:
  - Todos los cambios de diseño, tamaños de tarjetas, skins, reglas, salas y seguridad hechos en el PC se guardan automáticamente en `wallpanel_state.json` y se sincronizan en vivo con la Tablet o celular.
- 🛡️ **Sistema "Armar Seguridad"**:
  - PIN cifrado en servidor (`SHA-256` + `AES-256`), retardo de salida de **60 segundos**, retardo de entrada de **30 segundos**, sensores configurables (*Abierto / Cerrado*), disparo de dispositivos, correo y alarma en Alexa.
- 🌍 **Sismógrafo ESP32 MPU-6050**:
  - Telemetría en vivo vía `wss://broker.emqx.io:8084/mqtt`, popup de alerta sísmica y modal directo a Vercel (`https://sismografo-wilson-v-s-projects.vercel.app/`).

---

## 🚀 Ejecución Local y en Tablet

1. Ejecuta `iniciar_servidor.bat` o `npm start`.
2. En PC abre: `http://127.0.0.1:3001`
3. En tu Tablet (misma red Wi-Fi) abre: `http://192.168.1.45:3001` o `http://192.168.1.72:3001`
