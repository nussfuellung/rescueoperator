/** Kennzeichnung für Fahrzeuge, die noch in Status 8 an der Klinik übergeben */
export function S8Tag() {
  return (
    <span className="s8-tag" title="Status 8: Fahrzeug übergibt noch in der Klinik. Bei Alarmierung beendet es die Übergabe und fährt von dort los, die Zeit enthält den Rest der Übergabe.">
      nach Übergabe
    </span>
  );
}
