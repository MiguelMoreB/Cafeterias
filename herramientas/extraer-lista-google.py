#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extraer-lista-google.py — Saca tus listas guardadas de Google Maps con coordenadas.

POR QUÉ EXISTE
--------------
Ni el CSV de Google Takeout ni el KML de My Maps traen las coordenadas de tus
lugares guardados (el CSV solo lleva un identificador interno de Google, y My
Maps geocodifica al dibujar, no al exportar). Pero cuando compartes una lista,
la página que la muestra pide los datos a un endpoint de Google que SÍ devuelve
nombre, dirección y coordenadas de cada lugar.

Este script hace justo eso y te deja un KML listo para importar en la app.

CÓMO SE USA
-----------
1. En Google Maps, abre tu lista → Compartir → copia el enlace.
   (La lista debe estar compartida; si es privada, Google no entrega los datos.)

2. Corre:

       python herramientas/extraer-lista-google.py "https://maps.app.goo.gl/XXXX"

3. Te genera "mi-lista.kml" en la misma carpeta. Ese archivo se importa en la
   app desde  ＋ → Traer desde Google Maps → Importar archivo.

ADVERTENCIA HONESTA
-------------------
Ese endpoint es interno de Google: no está documentado ni prometido, así que
Google puede cambiarlo cuando quiera y este script dejaría de funcionar. No
depende de él nada de la app: es solo un atajo para no capturar a mano.
"""

import json
import re
import sys
import urllib.request

AGENTE = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0 Safari/537.36')

ENDPOINT = ('https://www.google.com/maps/preview/entitylist/getlist'
            '?authuser=0&hl=es-419&gl=mx'
            '&pb=%211m4%211s{id}%212e1%213m1%211e1%212e2%213e2%214i500%2128e2%2116b1')


def pedir(url):
    peticion = urllib.request.Request(url, headers={
        'User-Agent': AGENTE,
        'Accept-Language': 'es-419,es',
    })
    with urllib.request.urlopen(peticion, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace'), resp.geturl()


def id_de_la_lista(enlace):
    """El enlace corto redirige a una URL que lleva el id tras '!2s'."""
    _, url_final = pedir(enlace)
    encontrado = re.search(r'!2s([A-Za-z0-9_\-]{20,})', url_final)
    if not encontrado:
        # Por si te pasaron directamente la URL larga de la lista.
        encontrado = re.search(r'/placelists/list/([A-Za-z0-9_\-]{20,})', enlace)
    if not encontrado:
        raise SystemExit('No pude sacar el id de la lista de ese enlace.')
    return encontrado.group(1)


def entradas(nodo, salida):
    """Recorre la respuesta buscando [.., [..,dirección,[,,lat,lon],..], "Nombre", ..]"""
    if not isinstance(nodo, list):
        return
    if (len(nodo) > 2 and isinstance(nodo[1], list) and len(nodo[1]) > 5
            and isinstance(nodo[2], str) and nodo[2]):
        info = nodo[1]
        punto = info[5]
        if (isinstance(punto, list) and len(punto) >= 4
                and isinstance(punto[2], float) and isinstance(punto[3], float)):
            salida.append({
                'nombre': nodo[2],
                'direccion': info[4] if isinstance(info[4], str) else '',
                'lat': punto[2],
                'lon': punto[3],
            })
            return
    for hijo in nodo:
        entradas(hijo, salida)


def sin_repetidos(lugares):
    vistos, unicos = set(), []
    for lugar in lugares:
        llave = (lugar['nombre'], round(lugar['lat'], 6))
        if llave in vistos:
            continue
        vistos.add(llave)
        unicos.append(lugar)
    return unicos


def escapar(texto):
    return (texto.replace('&', '&amp;').replace('<', '&lt;')
                 .replace('>', '&gt;').replace('"', '&quot;'))


def escribir_kml(lugares, destino, titulo):
    partes = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<kml xmlns="http://www.opengis.net/kml/2.2">',
              '  <Document>',
              '    <name>%s</name>' % escapar(titulo)]
    for lugar in lugares:
        partes += [
            '    <Placemark>',
            '      <name>%s</name>' % escapar(lugar['nombre']),
            '      <description>%s</description>' % escapar(lugar['direccion']),
            # En KML va longitud PRIMERO y latitud después.
            '      <Point><coordinates>%s,%s,0</coordinates></Point>' % (lugar['lon'], lugar['lat']),
            '    </Placemark>']
    partes += ['  </Document>', '</kml>', '']

    with open(destino, 'w', encoding='utf-8') as archivo:
        archivo.write('\n'.join(partes))


def main():
    if len(sys.argv) < 2:
        raise SystemExit('Uso: python extraer-lista-google.py "<enlace de tu lista>" [salida.kml]')

    enlace = sys.argv[1]
    destino = sys.argv[2] if len(sys.argv) > 2 else 'mi-lista.kml'

    print('Siguiendo el enlace...')
    lista_id = id_de_la_lista(enlace)
    print('Id de la lista: %s' % lista_id)

    crudo, _ = pedir(ENDPOINT.format(id=lista_id))
    if not crudo.lstrip().startswith(")]}'"):
        raise SystemExit('Google no devolvió la lista. ¿Está compartida con "cualquiera con el enlace"?')

    datos = json.loads(crudo[crudo.index('['):])
    encontrados = []
    entradas(datos, encontrados)
    lugares = sin_repetidos(encontrados)

    if not lugares:
        raise SystemExit('La respuesta llegó pero venía sin lugares dentro.')

    escribir_kml(lugares, destino, 'Lista de Google Maps')
    # Nota: la consola de Windows no sabe imprimir simbolos como el mas ancho
    # ni las flechas, asi que los mensajes van en ASCII a proposito.
    print('Listo: %d lugares en %s' % (len(lugares), destino))
    print('Importalo en la app: boton + -> Traer desde Google Maps -> Importar archivo')


if __name__ == '__main__':
    main()
