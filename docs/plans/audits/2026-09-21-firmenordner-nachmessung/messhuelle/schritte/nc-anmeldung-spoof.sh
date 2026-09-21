# Orin. Kann ein Aufrufer mit gueltiger Sitzung (anna) sich per mitgeschickter Kopfzeile als admin ausgeben?
# Gemessen wird, wie viele Eintraege admins Ordner dem Aufrufer liefert (nur er selbst = 1: kein Zugriff).
T=http://127.0.0.1:18083
n() { curl -s -X PROPFIND -H 'Depth: 1' "$@" $T/remote.php/dav/files/admin/ | grep -o '<d:href>' | wc -l; }
echo "Sitzung anna, keine Zusatzkopfzeile                       : admins Ordner liefert $(n -H 'Cookie: arasul_session=gueltig-anna') Eintraege"
echo "Sitzung anna + X-Arasul-User: admin (Bindestrich)         : $(n -H 'Cookie: arasul_session=gueltig-anna' -H 'X-Arasul-User: admin') Eintraege"
echo "Sitzung anna + X_Arasul_User: admin (Unterstrich)         : $(n -H 'Cookie: arasul_session=gueltig-anna' -H 'X_Arasul_User: admin') Eintraege"
echo "Sitzung anna + X.Arasul.User: admin (Punkt)               : $(n -H 'Cookie: arasul_session=gueltig-anna' -H 'X.Arasul.User: admin') Eintraege"
echo "(zum Vergleich) direkt am Dienst mit X-Arasul-User: admin : $(curl -s -X PROPFIND -H 'Depth: 1' -H 'X-Arasul-User: admin' http://127.0.0.1:18081/remote.php/dav/files/admin/ | grep -o '<d:href>' | wc -l) Eintraege"
