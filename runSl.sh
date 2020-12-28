#!/bin/bash

while [ "$1" != "" ]; do
  argstring="$argstring ${1}"
  shift;
done

echo $argstring

LANG=C perl /home/pi/Slic3r/slic3r.pl $argstring;
