# Windhawk (opcional) — ilha sempre por cima

O Bifrost resolve o "notch" sozinho (fase 15, `src-tauri/src/notch.rs`):
AppBar no alto da tela (janelas maximizadas ficam abaixo), reafirmação do
"sempre por cima" a cada ~750 ms e regra de tela cheia (Ajustes › Geral).

Use este mod **só** se algum programa ainda conseguir ficar acima da ilha.

1. Instale o Windhawk: https://windhawk.net
2. Windhawk › *Create a new mod* (ou *Explore* › ⋯ › *Edit*), apague o exemplo e cole `bifrost-notch.wh.cpp`.
3. *Compile Mod* → *Exit editing mode*. Ele roda dentro do `explorer.exe`.
4. Ajuste "Ceder à tela cheia" nas configurações do mod.

Não há CSS/JS aqui: o Windhawk só compila mods C++ (os "estilos" de barra de
tarefas dele são XAML). O visual da ilha continua no CSS/TS do próprio Bifrost.
