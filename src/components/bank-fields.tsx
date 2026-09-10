import { domesticBanks } from "@/lib/bank-details";
import type { Member } from "@/lib/domain";
export default function BankFields({
  member,
  required = true,
}: {
  member?: Partial<Member>;
  required?: boolean;
}) {
  return (
    <div className="bank-fields">
      <label>
        국내은행
        <select
          name="bank_name"
          defaultValue={member?.bank_name ?? ""}
          required={required}
        >
          <option value="">은행 선택</option>
          {domesticBanks.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        계좌번호
        <input
          name="account_number"
          defaultValue={member?.account_number ?? ""}
          required={required}
          inputMode="numeric"
          pattern="[0-9\- ]{8,30}"
          maxLength={30}
          autoComplete="off"
          placeholder="계좌번호를 입력하세요"
        />
      </label>
      <label>
        예금주
        <input
          name="account_holder"
          defaultValue={member?.account_holder ?? ""}
          required={required}
          maxLength={80}
          placeholder="통장에 표시된 예금주명"
          autoComplete="off"
        />
      </label>
    </div>
  );
}
