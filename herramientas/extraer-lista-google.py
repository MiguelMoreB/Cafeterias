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
import time
import urllib.parse
import urllib.request

AGENTE = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/131.0 Safari/537.36')

ENDPOINT = ('https://www.google.com/maps/preview/entitylist/getlist'
            '?authuser=0&hl=es-419&gl=mx'
            '&pb=%211m4%211s{id}%212e1%213m1%211e1%212e2%213e2%214i500%2128e2%2116b1')

URL_FICHA = 'https://www.google.com/maps/preview/place?authuser=0&hl=es-419&gl=mx&pb='


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
    """Recorre la respuesta buscando [.., [..,dirección,[,,lat,lon],[ids],..], "Nombre", ..]"""
    if not isinstance(nodo, list):
        return
    if (len(nodo) > 2 and isinstance(nodo[1], list) and len(nodo[1]) > 6
            and isinstance(nodo[2], str) and nodo[2]):
        info = nodo[1]
        punto = info[5]
        ids = info[6]
        if (isinstance(punto, list) and len(punto) >= 4
                and isinstance(punto[2], float) and isinstance(punto[3], float)):
            salida.append({
                'nombre': nodo[2],
                'direccion': info[4] if isinstance(info[4], str) else '',
                'lat': punto[2],
                'lon': punto[3],
                # El segundo identificador (el "cid") es el que sirve para pedir
                # la ficha del lugar, que es donde vienen los horarios.
                'cid': str(ids[1]) if isinstance(ids, list) and len(ids) > 1 else None,
            })
            return
    for hijo in nodo:
        entradas(hijo, salida)


# --------------------------------------------------------------------------
# Horarios: se piden uno por uno a la ficha del lugar.
# --------------------------------------------------------------------------

DIAS_GOOGLE = {'lunes': 1, 'martes': 2, 'miércoles': 3, 'jueves': 4,
               'viernes': 5, 'sábado': 6, 'domingo': 0}


def cid_a_hex(cid):
    """Los cid vienen como enteros de 64 bits CON SIGNO. Para el hexadecimal
    que espera Google, a los negativos hay que sumarles 2^64 (no quitarles el
    signo: eso da un lugar equivocado o inexistente)."""
    n = int(cid)
    if n < 0:
        n += 1 << 64
    return format(n, 'x')


def horario_del_lugar(cid, intentos=6):
    """Pide la semana varias veces si hace falta.

    Google responde de forma INCONSISTENTE: con la misma petición, a veces
    manda los 7 días y a veces solo el de hoy (comprobado pidiendo dos veces
    seguidas el mismo lugar). Por eso reintentamos y vamos juntando los días
    que falten, en vez de quedarnos con la primera respuesta.
    """
    semana = {}
    for intento in range(intentos):
        try:
            nuevos = _pedir_semana(cid, intento)
        except Exception:
            if intento == intentos - 1:
                raise
            time.sleep(1)
            continue
        for dia, turnos in nuevos.items():
            if dia not in semana or (turnos and not semana[dia]):
                semana[dia] = turnos
        if len(semana) >= 7:
            break
        time.sleep(0.6)
    return semana


def _pedir_semana(cid, variante=0):
    """Devuelve {0..6: [{'desde': min, 'hasta': min}]} o {} si no hay datos.

    La ficha trae la semana así:
        ["jueves",4,[2026,9,24],[["8 a.m.-6 p.m.",[[8],[18]]]],0,1]
    o, si ese día cierra:
        ["domingo",7,[2026,9,27],[["Cerrado"]],0,2]
    """
    # OJO: con una petición mínima, Google a veces devuelve SOLO el día de hoy
    # (pasó con "Café Galeno": 1 día en vez de 7). Hay que mandar el bloque
    # largo, el mismo que manda Google al abrir la ficha, para que incluya la
    # semana completa. Estos números son opciones internas suyas; no hay
    # documentación, se copiaron de una petición real.
    # Alternar el encuadre del mapa entre intentos cambia la respuesta: con
    # unas coordenadas manda la semana y con otras solo hoy. No hay logica
    # aparente, asi que se prueban las dos.
    encuadre = ('!1d60213!2d-99.195!3d19.398' if variante % 2 == 0
                else '!1d60213.08825986231!2d-99.1952896!3d19.398656')
    pb = ('!1m14!1s0x0:0x{cid}!3m12!1m3{encuadre}'
          '!2m3!1f0.0!2f0.0!3f0.0!3m2!1i1024!2i768!4f13.1!12m4!2m3!1i360!2i120!4i8'
          '!13m57!2m2!1i203!2i100!3m2!2i4!5b1!6m6!1m2!1i86!2i86!1m2!1i408!2i240'
          '!7m33!1m3!1e1!2b0!3e3!1m3!1e2!2b1!3e2!1m3!1e2!2b0!3e3!1m3!1e8!2b0!3e3'
          '!1m3!1e10!2b0!3e3!1m3!1e10!2b1!3e2!1m3!1e10!2b0!3e4!1m3!1e9!2b1!3e2!2b1!9b0'
          '!15m8!1m7!1m2!1m1!1e2!2m2!1i195!2i195!3i20!21m0!22m1!1e81'
          '!30m8!3b1!6m2!1b1!2b1!7m2!1e3!2b1!9b1!34m5!7b1!10b1!14b1!15m1!1b0'
          ).format(cid=cid_a_hex(cid), encuadre=encuadre)
    crudo, _ = pedir(URL_FICHA + urllib.parse.quote(pb, safe=''))
    if '[' not in crudo:
        return {}
    datos = json.loads(crudo[crudo.index('['):])

    semana = {}

    def buscar(nodo):
        if not isinstance(nodo, list):
            return
        if (len(nodo) > 3 and isinstance(nodo[0], str) and nodo[0] in DIAS_GOOGLE
                and isinstance(nodo[1], int) and isinstance(nodo[3], list)):
            dia = DIAS_GOOGLE[nodo[0]]
            if dia not in semana:
                turnos = []
                for tramo in nodo[3]:
                    if not (isinstance(tramo, list) and len(tramo) > 1
                            and isinstance(tramo[1], list) and len(tramo[1]) > 1):
                        continue  # "Cerrado" no trae horas
                    abre, cierra = tramo[1][0], tramo[1][1]
                    if not (isinstance(abre, list) and isinstance(cierra, list)):
                        continue
                    turnos.append({
                        'desde': abre[0] * 60 + (abre[1] if len(abre) > 1 else 0),
                        'hasta': cierra[0] * 60 + (cierra[1] if len(cierra) > 1 else 0),
                    })
                semana[dia] = turnos
            return
        for hijo in nodo:
            buscar(hijo)

    buscar(datos)
    return semana


def seguro(texto):
    """La consola de Windows usa cp1252 y truena con caracteres como la 'O'
    con raya de 'LOU Brew Bar'. Solo afecta lo que se imprime en pantalla:
    el archivo de salida se guarda completo en UTF-8."""
    return str(texto).encode('ascii', 'replace').decode('ascii')


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


def escribir_json(lugares, destino):
    """Formato propio de la app: trae los horarios, cosa que el KML no puede."""
    salida = []
    for lugar in lugares:
        salida.append({
            'nombre': lugar['nombre'],
            'direccion': lugar['direccion'],
            'lat': lugar['lat'],
            'lon': lugar['lon'],
            'horarios': lugar.get('horarios') or {},
        })
    with open(destino, 'w', encoding='utf-8') as archivo:
        json.dump(salida, archivo, ensure_ascii=False, indent=1)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(
            'Uso: python extraer-lista-google.py "<enlace de tu lista>" [salida.json]\n'
            '  La salida .json incluye los horarios; .kml solo las ubicaciones.')

    enlace = sys.argv[1]
    destino = sys.argv[2] if len(sys.argv) > 2 else 'mi-lista.json'
    con_horarios = not destino.lower().endswith('.kml')

    print('Siguiendo el enlace...')
    lista_id = id_de_la_lista(enlace)
    print('Id de la lista: %s' % lista_id)

    crudo, _ = pedir(ENDPOINT.format(id=lista_id))
    if not crudo.lstrip().startswith(")]}'"):
        raise SystemExit('Google no devolvio la lista. Esta compartida con "cualquiera con el enlace"?')

    datos = json.loads(crudo[crudo.index('['):])
    encontrados = []
    entradas(datos, encontrados)
    lugares = sin_repetidos(encontrados)

    if not lugares:
        raise SystemExit('La respuesta llego pero venia sin lugares dentro.')
    print('Lugares en la lista: %d' % len(lugares))

    if con_horarios:
        con_datos = 0
        for numero, lugar in enumerate(lugares, 1):
            if not lugar.get('cid'):
                continue
            try:
                lugar['horarios'] = horario_del_lugar(lugar['cid'])
                if any(lugar['horarios'].values()):
                    con_datos += 1
            except Exception as error:
                print('  (sin horario) %s: %s' % (seguro(lugar['nombre']), seguro(error)))
            print('  %d/%d %s' % (numero, len(lugares), seguro(lugar['nombre'])[:40]))
            time.sleep(0.4)  # no atosigar a Google
        print('Con horario: %d de %d' % (con_datos, len(lugares)))
        escribir_json(lugares, destino)
    else:
        escribir_kml(lugares, destino, 'Lista de Google Maps')

    # Nota: la consola de Windows no sabe imprimir simbolos como el mas ancho
    # ni las flechas, asi que los mensajes van en ASCII a proposito.
    print('Listo: %d lugares en %s' % (len(lugares), destino))
    print('Importalo en la app: boton + -> Traer desde Google Maps -> Importar archivo')


if __name__ == '__main__':
    main()
