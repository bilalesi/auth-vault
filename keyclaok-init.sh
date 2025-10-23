alias kcadm=/opt/keycloak/bin/kcadm.sh

REALM=SBO
REALM_ID=dec81d98-ea76-4303-969a-d26c5f994732
kcadm config credentials --server http://localhost:8081/auth --realm master --user admin
kcadm create realms -s id=$REALM_ID -s realm=$REALM

kcadm create clients -r $REALM -s clientId=auth -s clientId=auth -s name=auth -s enabled=true
kcadm create clients -r $REALM -s clientId=cli -s name=auth -s enabled=true

kcadm update realms/master -s sslRequired=NONE
