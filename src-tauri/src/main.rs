// Evita la consola adicional en Windows en las versiones de lanzamiento. NO QUITAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    deskflow_lib::run();
}
