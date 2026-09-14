"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Leaf, Package, X } from "lucide-react";
import { money, type Product } from "@/lib/domain";
import { type MemberData, memberSnapshot } from "@/lib/member-data";
import { demoCredit, seedDemo } from "@/lib/demo";
import { buyProduct } from "@/app/actions";

export default function MemberShop({
  data,
  demo,
  onChange,
}: {
  data: MemberData;
  demo: boolean;
  onChange: (data: MemberData) => void;
}) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef(""),
    inFlight = useRef(false);
  const router = useRouter();
  const isRepeat = (data.purchaseCount ?? data.purchases.length) > 0;
  const price = (product: Product) =>
    isRepeat ? (product.repeat_pv_price ?? product.pv_price) : product.pv_price;
  async function purchase() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const saved = localStorage.getItem("vital-partners-demo-v2");
        const updated = demoCredit(
          saved ? JSON.parse(saved) : seedDemo(),
          data.member.id,
          "PV 상품 구매",
          request.current,
          selected,
        );
        localStorage.setItem("vital-partners-demo-v2", JSON.stringify(updated));
        onChange(memberSnapshot(updated, data.member.id));
      } else {
        const result = await buyProduct(selected.id, request.current);
        if (result.error) throw new Error(result.error);
        router.refresh();
      }
      dialog.current?.close();
      setSelected(null);
      setSuccess(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="member-page-title">
        <p>PARTNERS SHOP</p>
        <h1>상품</h1>
        <span>보유 PV로 상품을 구매하세요.</span>
      </div>
      <section className="member-shop-balance">
        <span>사용 가능한 PV</span>
        <strong>
          {money(data.member.pv)} <small>PV</small>
        </strong>
      </section>
      {success && (
        <div className="member-shop-success" role="status">
          구매가 완료됐어요. <Link href="/app/orders">배송 현황 보기 →</Link>
        </div>
      )}
      {(data.products ?? []).map((product) => (
        <section className="member-card member-product" key={product.id}>
          <div className="member-product-art" aria-hidden="true">
            <Leaf size={32} />
            <div>
              <span>VITAL PARTNERS</span>
              <strong>활력</strong>
              <small>일상에 더하는 활력</small>
            </div>
            <Package size={52} />
          </div>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          <p>
            {isRepeat ? "재구매 가격" : "최초 구매 가격"} · 최초{" "}
            {money(product.pv_price)} PV / 재구매{" "}
            {money(product.repeat_pv_price ?? product.pv_price)} PV
          </p>
          <strong className="member-product-price">
            {money(price(product))} <small>PV</small>
          </strong>
          <button
            className="member-primary"
            disabled={data.member.pv < price(product)}
            onClick={() => {
              setSelected(product);
              request.current = crypto.randomUUID();
              setError("");
              setSuccess(false);
              dialog.current?.showModal();
            }}
          >
            상품 선택 · PV로 구매
          </button>
          {data.member.pv < price(product) && (
            <p className="member-explanation">
              {money(price(product) - data.member.pv)} PV가 부족해요. 관리자에게
              충전을 요청해 주세요.
            </p>
          )}
        </section>
      ))}
      {!data.products?.length && (
        <p className="member-empty">판매 중인 상품이 없어요.</p>
      )}
      <p className="member-explanation">
        구매 1건마다 보너스 한도 150만원이 추가되고, 구매 PV를 기준으로 해당
        보너스가 계산돼요.
      </p>
      <dialog
        ref={dialog}
        className="member-checkout"
        aria-labelledby="checkout-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="member-section-heading">
          <h2 id="checkout-title">주문 확인</h2>
          <button
            aria-label="닫기"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        {selected && (
          <>
            <h3>{selected.name}</h3>
            <dl className="member-details">
              <div>
                <dt>사용 PV</dt>
                <dd>{money(price(selected))} PV</dd>
              </div>
              <div>
                <dt>구매 후 잔액</dt>
                <dd>
                  {money(Math.max(0, data.member.pv - price(selected)))} PV
                </dd>
              </div>
              <div>
                <dt>추가 보너스 한도</dt>
                <dd>1,500,000원</dd>
              </div>
            </dl>
            <h3>받으실 주소</h3>
            <p className="member-address">
              {data.member.name} · {data.member.phone}
              <br />({data.member.postcode}) {data.member.address}{" "}
              {data.member.address_detail}
            </p>
            <p className="member-explanation">
              배송지가 다르면 구매 전에 관리자에게 변경을 요청해 주세요.
            </p>
            {error && (
              <p role="alert" className="member-shop-error">
                {error}
              </p>
            )}
            <button
              className="member-primary"
              disabled={busy}
              onClick={() => void purchase()}
            >
              {busy
                ? "구매 처리 중…"
                : `${money(price(selected))} PV 결제 확정`}
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
