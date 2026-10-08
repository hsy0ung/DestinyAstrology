import assert from "node:assert/strict";
import { test } from "node:test";
import { CITIES, CITY_GROUPS } from "../src/lib/types";

test("birthplace choices cover every Korean metropolitan city and special city", () => {
  const expected = [
    ["서울", "서울특별시"], ["부산", "부산광역시"], ["대구", "대구광역시"], ["인천", "인천광역시"],
    ["광주", "광주광역시"], ["대전", "대전광역시"], ["울산", "울산광역시"], ["세종", "세종특별자치시"],
  ];
  for (const [name, label] of expected) {
    const city = CITIES.find((item) => item.city === name);
    assert.ok(city, `${label} is missing`);
    assert.equal(city.label, label);
    assert.equal(city.region, label);
    assert.equal(city.timezone, "Asia/Seoul");
  }
});

test("every Korean administrative region has a selectable city with local coordinates", () => {
  const expected = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
  ];
  const domestic = CITIES.filter((city) => city.region !== "해외");
  assert.deepEqual([...new Set(domestic.map((city) => city.region))].sort(), [...expected].sort());
  for (const region of expected) {
    assert.ok(CITY_GROUPS.some((group) => group === region));
  }
  for (const city of domestic) {
    assert.equal(city.timezone, "Asia/Seoul");
    assert.ok(city.latitude >= 33 && city.latitude <= 39, `${city.city} latitude`);
    assert.ok(city.longitude >= 124 && city.longitude <= 132, `${city.city} longitude`);
  }
  // Cities within one province must retain their own coordinates.
  assert.notEqual(CITIES.find((city) => city.city === "제주")?.latitude, CITIES.find((city) => city.city === "서귀포")?.latitude);
  assert.notEqual(CITIES.find((city) => city.city === "춘천")?.longitude, CITIES.find((city) => city.city === "강릉")?.longitude);
});

test("city identifiers remain unique and previously available cities stay compatible", () => {
  const previousCities = ["서울", "부산", "인천", "대구", "대전", "광주", "제주", "도쿄", "뉴욕", "런던", "로스앤젤레스", "시드니"];
  assert.equal(new Set(CITIES.map((city) => city.city)).size, CITIES.length);
  for (const name of previousCities) {
    assert.ok(CITIES.some((city) => city.city === name), `${name} should remain selectable`);
  }
  for (const city of CITIES) {
    assert.ok(city.label.length > 0);
    assert.ok(CITY_GROUPS.some((group) => group === city.region));
    assert.ok(Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90);
    assert.ok(Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180);
  }
  assert.deepEqual(CITIES.filter((city) => city.region === "해외").map((city) => city.city), ["도쿄", "뉴욕", "런던", "로스앤젤레스", "시드니"]);
});
