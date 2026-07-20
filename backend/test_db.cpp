#include <iostream>
#include <libpq-fe.h>
int main() {
  PGconn *conn = PQconnectdb("postgresql://postgres:Nb011206.,.,-@db.mmlpahjnzxhrbjfeevyu.supabase.co:5432/postgres");
  if (PQstatus(conn) != CONNECTION_OK) {
    std::cerr << "FAILED: " << PQerrorMessage(conn) << std::endl;
  } else {
    std::cout << "SUCCESS" << std::endl;
  }
  PQfinish(conn);
  return 0;
}
