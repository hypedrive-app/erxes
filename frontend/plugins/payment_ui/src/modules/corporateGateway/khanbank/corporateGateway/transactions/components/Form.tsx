import { useEffect, useState } from 'react';
import { Button, Input, Label, Select } from 'erxes-ui';
import { BANK_CODES } from '~/modules/payment/constants';
import { IAccountHolder, IKhanbankAccount } from '../../accounts/types';
import { IKhanbankTransactionInput } from '../types';
import { getRawAccountNumber } from '../../../utils';

type Props = {
  configId: string;
  accounts: IKhanbankAccount[];
  accountNumber?: string;
  accountHolder: IAccountHolder;
  getAccountHolder: (accountNumber: string, bankCode?: string) => void;
  accountLoading?: boolean;
  submit: (transfer: IKhanbankTransactionInput) => void;
  closeModal: () => void;
};

const TransactionForm = ({
  accounts = [],
  accountNumber,
  accountHolder,
  getAccountHolder,
  accountLoading,
  submit,
  closeModal,
}: Props) => {
  const defaultCurrency =
    accounts.find((a) => a.number === accountNumber)?.currency || 'MNT';

  const [transactionType, setTransactionType] = useState<number>(1);

  const [transaction, setTransaction] = useState<IKhanbankTransactionInput>({
    fromAccount: accountNumber || accounts[0]?.number || '',
    toAccount: '',
    toAccountName: '',
    amount: 0,
    currency: defaultCurrency,
    transferid: Date.now().toString(),
    toBank: '050000',
    toCurrency: 'MNT',
    description: '',
    password: '',
    loginName: '',
    type: 'domestic',
  });

  useEffect(() => {
    if (accountNumber) {
      setTransaction((prev) => ({
        ...prev,
        fromAccount: accountNumber,
        currency: defaultCurrency,
      }));
    }
  }, [accountNumber]);

  useEffect(() => {
    if (accountHolder?.number) {
      setTransaction((prev) => ({
        ...prev,
        toAccount: accountHolder.number,
        toAccountName: accountHolder.custFirstName || '',
        toCurrency: accountHolder.currency || 'MNT',
      }));
    }
  }, [accountHolder]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setTransaction((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFieldChange = (name: string, value: string) => {
    setTransaction((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTypeChange = (value: string) => {
    const newType = Number(value);

    setTransactionType(newType);

    setTransaction((prev) => ({
      ...prev,
      type: newType === 3 ? 'interbank' : 'domestic',
      toBank: newType === 3 ? '' : '050000',
      toAccount: '',
      toAccountName: '',
    }));
  };

  const handleBlur = () => {
    if ([1, 3].includes(transactionType)) {
      getAccountHolder(transaction.toAccount, transaction.toBank);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(transaction);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Login */}
      <div>
        <Label>Нэвтрэх нэр</Label>
        <Input
          name="loginName"
          value={transaction.loginName}
          onChange={handleChange}
          required
        />
      </div>

      <div>
        <Label>Нууц үг</Label>
        <Input
          type="password"
          name="password"
          value={transaction.password}
          onChange={handleChange}
          required
        />
      </div>

      {/* Type */}
      <div>
        <Label>Гүйлгээний төрөл</Label>
        <Select
          value={String(transactionType)}
          onValueChange={handleTypeChange}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="1">Банк доторхи</Select.Item>
            <Select.Item value="2">Өөрийн данс хооронд</Select.Item>
            <Select.Item value="3">Банк хооронд</Select.Item>
          </Select.Content>
        </Select>
      </div>

      {/* From Account */}
      <div>
        <Label>Шилжүүлэх данс</Label>
        <Input value={getRawAccountNumber(transaction.fromAccount)} disabled />
      </div>

      {/* Bank Select */}
      {transactionType === 3 && (
        <div>
          <Label>Банк</Label>
          <Select
            value={transaction.toBank}
            onValueChange={(value) => handleFieldChange('toBank', value)}
          >
            <Select.Trigger>
              <Select.Value placeholder="Банк сонгоно уу" />
            </Select.Trigger>
            <Select.Content>
              {BANK_CODES.map((bank) => (
                <Select.Item key={bank.value} value={bank.value}>
                  {bank.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      )}

      {/* To Account */}
      {transactionType !== 2 && (
        <>
          <div>
            <Label>Хүлээн авах данс/IBAN</Label>
            <Input
              name="toAccount"
              value={transaction.toAccount}
              onChange={handleChange}
              onBlur={handleBlur}
              required
            />
          </div>

          <div>
            <Label>Хүлээн авагчийн нэр</Label>
            <Input
              name="toAccountName"
              value={accountLoading ? 'Loading...' : transaction.toAccountName}
              onChange={handleChange}
              disabled={transactionType === 3}
              required
            />
          </div>
        </>
      )}

      {/* Own account transfer */}
      {transactionType === 2 && (
        <div>
          <Label>Хүлээн авах данс</Label>
          <Select
            value={transaction.toAccount}
            onValueChange={(value) => handleFieldChange('toAccount', value)}
          >
            <Select.Trigger>
              <Select.Value placeholder="Данс сонгох" />
            </Select.Trigger>
            <Select.Content>
              {accounts
                .filter((a) => a.number !== transaction.fromAccount)
                .map((a) => (
                  <Select.Item key={a.number} value={a.number}>
                    {a.number} - {a.currency}
                  </Select.Item>
                ))}
            </Select.Content>
          </Select>
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="ghost" onClick={closeModal}>
          Cancel
        </Button>

        <Button type="submit">Submit</Button>
      </div>
    </form>
  );
};

export default TransactionForm;
