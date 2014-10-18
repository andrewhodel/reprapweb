#!/bin/bash

while [ "$1" != "" ]; do
  argstring="$argstring ${1}"
  shift;
done

/usr/bin/perl /home/pi/Slic3r/slic3r.pl $argstring;
